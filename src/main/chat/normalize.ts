// Pure: stream-json lines in, ChatEvents out.

import type { ChatEvent, ChatState } from "../../shared/chat.ts"
import { asClaudeSessionId, asDirPath, asRequestId, asToolUseId, type ClaudeSessionId, type DirPath, type RequestId, type ToolUseId } from "../../shared/ids.ts"
import { arr, at, type Json, type JsonObject, num, obj, str, strings } from "../../shared/json.ts"
import { BlockIds } from "./blocks.ts"
import { flatten, structuredOf, toolResults, toolTitle, usageTokens } from "./content.ts"
import { TaskTracker } from "./tasks.ts"

const SEEN_MAX = 500

export interface PendingPermission {
  readonly input: Json
}

const TASK_SUBTYPES = new Set(["task_started", "task_progress", "task_updated", "task_notification"])

export class StreamNormalizer {
  state: ChatState | "starting" | "exited" = "starting"
  claudeSessionId: ClaudeSessionId | null = null
  model: string | null = null
  cwd: DirPath | null
  tools: ReadonlyArray<string> = []
  costUsd = 0
  contextTokens = 0
  readonly permissions = new Map<RequestId, PendingPermission>()

  private thinkingTokens: number | null = null
  private readonly blocks = new BlockIds()
  private readonly tasks = new TaskTracker()
  private readonly seenTools = new Set<string>()

  constructor(cwd: DirPath | null) {
    this.cwd = cwd
  }

  handle(msg: JsonObject): ReadonlyArray<ChatEvent> {
    switch (msg["type"]) {
      case "system":
        return this.onSystem(msg)
      case "stream_event":
        return this.onStream(msg)
      case "assistant":
        return this.onAssistant(msg)
      case "user":
        return this.onUser(msg)
      case "result":
        return this.onResult(msg)
      case "control_request":
        return this.onControlRequest(msg)
      case "control_cancel_request":
        return this.cancelPermission(asRequestId(String(msg["request_id"])))
      case "rate_limit_event": {
        const used = num(at(msg, "rate_limit_info", "unifiedWindows", "five_hour", "utilization"))
        return used === null ? [] : [{ kind: "rate-limit", percent: used * 100 }]
      }
      default:
        return []
    }
  }

  resolvePermission(requestId: RequestId, allowed: boolean): ReadonlyArray<ChatEvent> {
    return this.permissions.delete(requestId) ? [{ kind: "permission-resolved", requestId, allowed }] : []
  }

  // Prompt withdrawn by the CLI.
  cancelPermission(requestId: RequestId): ReadonlyArray<ChatEvent> {
    return this.permissions.delete(requestId) ? [{ kind: "permission-resolved", requestId, allowed: false, reason: "cancelled" }] : []
  }

  private onSystem(msg: JsonObject): ReadonlyArray<ChatEvent> {
    const subtype = str(msg["subtype"]) ?? ""
    if (TASK_SUBTYPES.has(subtype)) {
      const task = this.tasks.update(msg)
      return task ? [task] : []
    }
    switch (subtype) {
      case "init":
        return [this.onInit(msg)]
      case "thinking_tokens": {
        const n = num(msg["estimated_tokens"] ?? msg["tokens"] ?? msg["thinking_tokens"])
        if (n !== null) {
          this.thinkingTokens = n
        }
        return []
      }
      case "session_state_changed": {
        const state = msg["state"]
        if (state !== "running" && state !== "idle") {
          return []
        }
        this.state = state
        return [{ kind: "state", state }]
      }
      default:
        return []
    }
  }

  private onInit(msg: JsonObject): ChatEvent {
    const sessionId = str(msg["session_id"])
    const cwd = str(msg["cwd"])
    this.claudeSessionId = sessionId ? asClaudeSessionId(sessionId) : this.claudeSessionId
    this.model = str(msg["model"]) || this.model
    this.cwd = cwd ? asDirPath(cwd) : this.cwd
    this.tools = strings(msg["tools"])
    if (this.state === "starting") {
      this.state = "idle"
    }
    return {
      kind: "ready",
      claudeSessionId: this.claudeSessionId,
      model: this.model,
      cwd: this.cwd,
      tools: this.tools,
      slashCommands: strings(msg["slash_commands"]),
    }
  }

  // Text deltas for the main thread only.
  private onStream(msg: JsonObject): ReadonlyArray<ChatEvent> {
    const ev = obj(msg["event"])
    if (msg["parent_tool_use_id"] || !ev) {
      return []
    }
    const index = num(ev["index"]) ?? 0
    switch (ev["type"]) {
      case "message_start":
        this.blocks.startMessage(str(at(ev, "message", "id")) || str(msg["uuid"]))
        return []
      case "content_block_start":
        this.blocks.startBlock(index, at(ev, "content_block", "type"))
        return []
      case "content_block_delta": {
        const text = at(ev, "delta", "type") === "text_delta" ? str(at(ev, "delta", "text")) : null
        return text === null ? [] : [{ kind: "text-delta", block: this.blocks.delta(index), text }]
      }
      default:
        return []
    }
  }

  private onAssistant(msg: JsonObject): ReadonlyArray<ChatEvent> {
    const parentId = str(msg["parent_tool_use_id"])
    const parent = parentId ? asToolUseId(parentId) : null
    const mid = str(at(msg, "message", "id")) || str(msg["uuid"]) || ""
    return arr(at(msg, "message", "content")).flatMap((p) => {
      const part = obj(p)
      return part ? this.assistantPart(part, mid, parent) : []
    })
  }

  // Events for one assistant content part.
  private assistantPart(part: JsonObject, mid: string, parent: ToolUseId | null): ReadonlyArray<ChatEvent> {
    if (part["type"] === "text" && !parent) {
      return [{ kind: "text", block: this.blocks.final(mid, "text"), text: str(part["text"]) ?? "" }]
    }
    if (part["type"] === "thinking" && !parent) {
      return [{ kind: "thinking", block: this.blocks.final(mid, "thinking"), text: str(part["thinking"]) ?? "", tokens: this.thinkingTokens }]
    }
    const id = str(part["id"])
    if (part["type"] !== "tool_use" || !id || this.seenTools.has(id)) {
      return []
    }
    this.seenTools.add(id)
    if (this.seenTools.size > SEEN_MAX) {
      this.seenTools.delete(this.seenTools.values().next().value!)
    }
    const name = str(part["name"]) ?? ""
    return [
      {
        kind: "tool-start",
        toolUseId: asToolUseId(id),
        name,
        title: toolTitle(name, part["input"]),
        input: part["input"] ?? {},
        parentToolUseId: parent,
      },
    ]
  }

  private onUser(msg: JsonObject): ReadonlyArray<ChatEvent> {
    const content = at(msg, "message", "content")
    if (!Array.isArray(content)) {
      return []
    }
    const results = toolResults(content)
    return results.map(
      (p): ChatEvent => ({
        kind: "tool-end",
        toolUseId: asToolUseId(String(p["tool_use_id"])),
        isError: p["is_error"] === true,
        content: flatten(p["content"]),
        // Structured result, only with a single tool result.
        structured: results.length === 1 ? structuredOf(msg["tool_use_result"]) : null,
      }),
    )
  }

  private onResult(msg: JsonObject): ReadonlyArray<ChatEvent> {
    // Session total cost.
    this.costUsd = num(msg["total_cost_usd"]) ?? this.costUsd
    this.contextTokens = usageTokens(msg["usage"])
    return [
      {
        kind: "turn-end",
        isError: msg["is_error"] === true,
        stopReason: str(msg["stop_reason"]) || str(msg["terminal_reason"]) || str(msg["subtype"]) || null,
        costUsd: this.costUsd,
        contextTokens: this.contextTokens,
        numTurns: num(msg["num_turns"]),
        durationMs: num(msg["duration_ms"]),
        text: str(msg["result"]) ?? "",
      },
    ]
  }

  private onControlRequest(msg: JsonObject): ReadonlyArray<ChatEvent> {
    const req = obj(msg["request"])
    const rawId = str(msg["request_id"])
    if (!req || req["subtype"] !== "can_use_tool" || !rawId) {
      return []
    }
    const requestId = asRequestId(rawId)
    const input = req["input"] ?? {}
    const name = str(req["tool_name"]) ?? ""
    const toolUseId = str(req["tool_use_id"])
    this.permissions.set(requestId, { input })
    return [
      {
        kind: "permission",
        requestId,
        toolUseId: toolUseId ? asToolUseId(toolUseId) : null,
        name,
        title: str(msg["title"]) || str(req["title"]) || str(req["display_name"]) || toolTitle(name, input),
        input,
        description: str(req["description"]) ?? "",
        suggestions: arr(req["permission_suggestions"]),
        requiresUserInteraction: req["requires_user_interaction"] === true,
      },
    ]
  }
}
