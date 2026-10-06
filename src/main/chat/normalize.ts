// Pure: stream-json lines in, ChatEvents out.

import type { ChatEvent, ChatState } from "../../shared/chat.ts"
import { BlockIds } from "./blocks.ts"
import { flatten, isObject, type Json, structuredOf, toolResults, toolTitle, usageTokens } from "./content.ts"
import { TaskTracker } from "./tasks.ts"

const SEEN_MAX = 500

export interface PendingPermission {
  readonly input: unknown
}

export class StreamNormalizer {
  state: ChatState | "starting" | "exited" = "starting"
  claudeSessionId: string | null = null
  model: string | null = null
  cwd: string | null
  tools: ReadonlyArray<string> = []
  costUsd = 0
  contextTokens = 0
  readonly permissions = new Map<string, PendingPermission>()

  private thinkingTokens: number | null = null
  private readonly blocks = new BlockIds()
  private readonly tasks = new TaskTracker()
  private readonly seenTools = new Set<string>()

  constructor(cwd: string | null) {
    this.cwd = cwd
  }

  handle(msg: Json): ReadonlyArray<ChatEvent> {
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
        return this.cancelPermission(msg["request_id"])
      case "rate_limit_event": {
        // Fraction in, percent out.
        const used = msg["rate_limit_info"]?.unifiedWindows?.five_hour?.utilization
        return typeof used === "number" ? [{ kind: "rate-limit", percent: used * 100 }] : []
      }
      default:
        return []
    }
  }

  resolvePermission(requestId: string, allowed: boolean): ReadonlyArray<ChatEvent> {
    return this.permissions.delete(requestId) ? [{ kind: "permission-resolved", requestId, allowed }] : []
  }

  // Cancelled is not a denial.
  cancelPermission(requestId: string): ReadonlyArray<ChatEvent> {
    return this.permissions.delete(requestId) ? [{ kind: "permission-resolved", requestId, allowed: false, reason: "cancelled" }] : []
  }

  private onSystem(msg: Json): ReadonlyArray<ChatEvent> {
    switch (msg["subtype"]) {
      case "init":
        return [this.onInit(msg)]
      case "thinking_tokens": {
        const n = msg["estimated_tokens"] ?? msg["tokens"] ?? msg["thinking_tokens"]
        if (typeof n === "number") this.thinkingTokens = n
        return []
      }
      case "session_state_changed":
        if (msg["state"] !== "running" && msg["state"] !== "idle") return []
        this.state = msg["state"]
        return [{ kind: "state", state: msg["state"] }]
      case "task_started":
      case "task_progress":
      case "task_updated":
      case "task_notification": {
        const task = this.tasks.update(msg)
        return task ? [task] : []
      }
      default:
        return []
    }
  }

  private onInit(msg: Json): ChatEvent {
    this.claudeSessionId = msg["session_id"] || this.claudeSessionId
    this.model = msg["model"] || this.model
    this.cwd = msg["cwd"] || this.cwd
    this.tools = Array.isArray(msg["tools"]) ? msg["tools"] : []
    if (this.state === "starting") this.state = "idle"
    return {
      kind: "ready",
      claudeSessionId: this.claudeSessionId,
      model: this.model,
      cwd: this.cwd,
      tools: this.tools,
      slashCommands: Array.isArray(msg["slash_commands"]) ? msg["slash_commands"] : [],
    }
  }

  // Subagent streams are not shown inline.
  private onStream(msg: Json): ReadonlyArray<ChatEvent> {
    const ev = msg["event"]
    if (msg["parent_tool_use_id"] || !isObject(ev)) return []
    if (ev["type"] === "message_start") this.blocks.startMessage(ev["message"]?.id || msg["uuid"])
    else if (ev["type"] === "content_block_start") this.blocks.startBlock(ev["index"], ev["content_block"]?.type)
    else if (ev["type"] === "content_block_delta" && ev["delta"]?.type === "text_delta" && typeof ev["delta"].text === "string") {
      return [{ kind: "text-delta", block: this.blocks.delta(ev["index"]), text: ev["delta"].text }]
    }
    return []
  }

  private onAssistant(msg: Json): ReadonlyArray<ChatEvent> {
    const parent: string | null = msg["parent_tool_use_id"] || null
    const mid = msg["message"]?.id || msg["uuid"]
    const content = msg["message"]?.content
    if (!Array.isArray(content)) return []
    const out: Array<ChatEvent> = []
    for (const part of content) {
      if (!isObject(part)) continue
      if (part["type"] === "text" && !parent) {
        out.push({ kind: "text", block: this.blocks.final(mid, "text"), text: part["text"] || "" })
      } else if (part["type"] === "thinking" && !parent) {
        out.push({ kind: "thinking", block: this.blocks.final(mid, "thinking"), text: part["thinking"] || "", tokens: this.thinkingTokens })
      } else if (part["type"] === "tool_use" && part["id"] && !this.seenTools.has(part["id"])) {
        this.seenTools.add(part["id"])
        if (this.seenTools.size > SEEN_MAX) this.seenTools.delete(this.seenTools.values().next().value!)
        out.push({
          kind: "tool-start",
          toolUseId: part["id"],
          name: part["name"] || "",
          title: toolTitle(part["name"] || "", part["input"]),
          input: part["input"] ?? {},
          parentToolUseId: parent,
        })
      }
    }
    return out
  }

  private onUser(msg: Json): ReadonlyArray<ChatEvent> {
    const content = msg["message"]?.content
    if (!Array.isArray(content)) return []
    const results = toolResults(content)
    return results.map((p) => ({
      kind: "tool-end",
      toolUseId: p["tool_use_id"],
      isError: p["is_error"] === true,
      content: flatten(p["content"]),
      // Only unambiguous with a single result.
      structured: results.length === 1 ? structuredOf(msg["tool_use_result"]) : null,
    }))
  }

  private onResult(msg: Json): ReadonlyArray<ChatEvent> {
    // Cumulative per session, so replace.
    if (typeof msg["total_cost_usd"] === "number") this.costUsd = msg["total_cost_usd"]
    this.contextTokens = usageTokens(msg["usage"])
    return [
      {
        kind: "turn-end",
        isError: msg["is_error"] === true,
        stopReason: msg["stop_reason"] || msg["terminal_reason"] || msg["subtype"] || null,
        costUsd: this.costUsd,
        contextTokens: this.contextTokens,
        numTurns: msg["num_turns"] ?? null,
        durationMs: msg["duration_ms"] ?? null,
        text: typeof msg["result"] === "string" ? msg["result"] : "",
      },
    ]
  }

  private onControlRequest(msg: Json): ReadonlyArray<ChatEvent> {
    const req = msg["request"]
    if (!isObject(req) || req["subtype"] !== "can_use_tool" || !msg["request_id"]) return []
    const input = req["input"] ?? {}
    const name: string = req["tool_name"] || ""
    this.permissions.set(msg["request_id"], { input })
    return [
      {
        kind: "permission",
        requestId: msg["request_id"],
        toolUseId: req["tool_use_id"] || null,
        name,
        title: msg["title"] || req["title"] || req["display_name"] || toolTitle(name, input),
        input,
        description: req["description"] || "",
        suggestions: Array.isArray(req["permission_suggestions"]) ? req["permission_suggestions"] : [],
        requiresUserInteraction: req["requires_user_interaction"] === true,
      },
    ]
  }
}
