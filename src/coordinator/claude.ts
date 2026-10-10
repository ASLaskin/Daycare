// Claude provider: one Agent SDK query per active session.

import { type CanUseTool, type Options, type PermissionResult, type PermissionUpdate, query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { ChildProcess } from "node:child_process"
import { StreamNormalizer } from "../main/chat/normalize.ts"
import { toolTitle } from "../main/chat/content.ts"
import type { ChatEvent } from "../shared/chat.ts"
import type { StoredSession } from "../shared/coordinator.ts"
import { asRequestId, asToolUseId, type FilePath, type RequestId } from "../shared/ids.ts"
import { obj, parseJson, str } from "../shared/json.ts"
import { MASTER_PROMPT, WORKER_PROMPT } from "../main/sessions/prompts.ts"
import { bridge, DAYCARE_TOOLS, TOOL_TIMEOUT_SECONDS } from "./orchestration.ts"
import { spawnGroup, stopGroup } from "./process.ts"
import { type Answer, type ProviderHandle, type ProviderUpdate, Refused } from "./provider.ts"

export type QueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => AsyncIterable<object> & Pick<Query, "interrupt" | "close">

// SDK values as plain JSON
const toJson = (value: object) => parseJson(JSON.stringify(value))

const permissionResult = (choice: string, answer: Answer, suggestions: ReadonlyArray<PermissionUpdate>): PermissionResult => {
  const updatedInput = obj(answer.updatedInput)
  const input = updatedInput ? { updatedInput } : {}
  switch (choice) {
    case "always":
      return { behavior: "allow", ...input, updatedPermissions: [...suggestions] }
    case "deny":
      return { behavior: "deny", message: answer.message ?? "denied" }
    default:
      return { behavior: "allow", ...input }
  }
}

export const startClaude = (
  session: StoredSession,
  claudePath: FilePath,
  update: (u: ProviderUpdate) => void,
  run: QueryFn = query,
): ProviderHandle => {
  const nativeId = session.nativeId
  if (!nativeId) {
    throw new Error("claude session has no native id")
  }
  const master = session.role === "master"
  interface Pending {
    readonly message: SDKUserMessage
    readonly confirm: () => void
    readonly refuse: (e: Error) => void
  }
  // Not yet taken by the SDK
  const inputs: Array<Pending> = []
  // Taken, awaiting a reply stamped with its uuid
  const unconfirmed = new Map<string, Pending>()
  const answers = new Map<RequestId, (answer: Answer) => boolean>()
  let wake = () => {}
  let closed = false
  let child: ChildProcess | null = null

  // Stops input, refusing anything never taken
  const end = (reason: string) => {
    closed = true
    inputs.splice(0).forEach((i) => i.refuse(new Refused(reason)))
    // Taken but unanswered: delivery uncertain
    unconfirmed.forEach((i) => i.refuse(new Error(reason)))
    unconfirmed.clear()
    wake()
  }

  // User messages for the SDK
  async function* prompts(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      const next = inputs.shift()
      if (next) {
        unconfirmed.set(next.message.uuid ?? "", next)
        yield next.message
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  }

  const canUseTool: CanUseTool = (tool, input, { signal, suggestions = [], ...details }) =>
    new Promise((resolve) => {
      const request = asRequestId(details.requestId)
      const choices = suggestions.length > 0 && !details.suppressAlwaysAllowRule ? ["allow", "always", "deny"] : ["allow", "deny"]
      answers.set(request, (answer) => {
        if (!choices.includes(answer.choice)) {
          return false
        }
        answers.delete(request)
        resolve(permissionResult(answer.choice, answer, suggestions))
        return true
      })
      signal.addEventListener("abort", () => {
        if (answers.delete(request)) {
          update({ type: "approval-gone", request })
          resolve({ behavior: "deny", message: "cancelled" })
        }
      })
      const json = toJson(input)
      const event: ChatEvent = {
        kind: "permission",
        requestId: request,
        toolUseId: asToolUseId(details.toolUseID),
        name: tool,
        title: details.title ?? toolTitle(tool, json ?? undefined),
        input: json,
        description: details.description ?? details.decisionReason ?? "",
        suggestions: suggestions.flatMap((s) => toJson(s) ?? []),
        requiresUserInteraction: false,
      }
      update({ type: "approval", request, choices, event })
    })

  const q = run({
    prompt: prompts(),
    options: {
      pathToClaudeCodeExecutable: claudePath,
      systemPrompt: { type: "preset", preset: "claude_code", append: master ? MASTER_PROMPT : WORKER_PROMPT },
      // Workers replace Claude's own subagents
      disallowedTools: ["Task", "Agent"],
      ...(master
        ? {
            mcpServers: { daycare: { ...bridge(session.id), alwaysLoad: true, timeout: TOOL_TIMEOUT_SECONDS * 1000 } },
            allowedTools: DAYCARE_TOOLS.map((name) => `mcp__daycare__${name}`),
          }
        : {}),
      // Own process group
      spawnClaudeCodeProcess: (o) => {
        const spawned = spawnGroup(o.command, o.args, { env: o.env, ...(o.cwd ? { cwd: o.cwd } : {}), signal: o.signal })
        child = spawned
        return spawned
      },
      cwd: session.cwd,
      includePartialMessages: true,
      canUseTool,
      permissionMode: session.permissionMode,
      env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" },
      ...(session.model ? { model: session.model } : {}),
      ...(session.state === "creating" ? { sessionId: nativeId } : { resume: nativeId }),
    },
  })

  // Ready confirms creation only with the saved native id
  const emit = (event: ChatEvent) => {
    update({ type: "event", event })
    if (event.kind !== "ready") {
      return
    }
    const reported: string | null = event.claudeSessionId
    if (reported === nativeId) {
      update({ type: "created" })
      return
    }
    update({ type: "error", message: `claude reported session ${reported}, expected ${nativeId}` })
  }

  const normalizer = new StreamNormalizer(session.cwd)
  void (async () => {
    try {
      for await (const message of q) {
        const json = obj(toJson(message))
        // First reply carries the message uuid
        const stamped = unconfirmed.get(str(json?.["user_message_uuid"]) ?? "")
        if (stamped) {
          unconfirmed.delete(stamped.message.uuid ?? "")
          stamped.confirm()
        }
        ;(json ? normalizer.handle(json) : []).forEach(emit)
      }
    } catch (e) {
      update({ type: "error", message: String(e) })
    }
    end("claude exited before taking the input")
    update({ type: "exited" })
  })()

  return {
    input: (text) => {
      if (closed) {
        return Promise.reject(new Refused("claude has stopped"))
      }
      return new Promise<void>((confirm, refuse) => {
        const message: SDKUserMessage = { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, uuid: crypto.randomUUID() }
        inputs.push({ message, confirm, refuse })
        wake()
      })
    },
    interrupt: () => {
      q.interrupt().catch((e: Error) => update({ type: "error", message: `interrupt failed: ${e.message}` }))
    },
    answer: (request, answer) => answers.get(request)?.(answer) ?? false,
    close: async () => {
      end("the session was closed before claude took the input")
      q.close()
      if (child) {
        await stopGroup(child)
      }
    },
  }
}
