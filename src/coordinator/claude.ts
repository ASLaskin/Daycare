// Claude provider: one Agent SDK query per active session.

import { type CanUseTool, type Options, type PermissionResult, type PermissionUpdate, query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { StreamNormalizer } from "../main/chat/normalize.ts"
import { toolTitle } from "../main/chat/content.ts"
import type { ChatEvent } from "../shared/chat.ts"
import type { StoredSession } from "../shared/coordinator.ts"
import { asRequestId, asToolUseId, type FilePath, type RequestId } from "../shared/ids.ts"
import { obj, parseJson } from "../shared/json.ts"
import type { Answer, ProviderHandle, ProviderUpdate } from "./provider.ts"

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
  const inputs: Array<SDKUserMessage> = []
  const answers = new Map<RequestId, (answer: Answer) => boolean>()
  let wake = () => {}
  let closed = false

  // User messages handed to the SDK as they arrive
  async function* prompts(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      const next = inputs.shift()
      if (next) {
        yield next
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
      cwd: session.cwd,
      includePartialMessages: true,
      canUseTool,
      permissionMode: session.permissionMode,
      env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" },
      ...(session.model ? { model: session.model } : {}),
      ...(session.state === "creating" ? { sessionId: nativeId } : { resume: nativeId }),
    },
  })

  // A ready event confirms creation only with the saved native id
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
        ;(json ? normalizer.handle(json) : []).forEach(emit)
      }
    } catch (e) {
      update({ type: "error", message: String(e) })
    }
    closed = true
    wake()
    update({ type: "exited" })
  })()

  return {
    input: (text) => {
      inputs.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })
      wake()
    },
    interrupt: () => {
      q.interrupt().catch((e: Error) => update({ type: "error", message: `interrupt failed: ${e.message}` }))
    },
    answer: (request, answer) => answers.get(request)?.(answer) ?? false,
    close: () => {
      closed = true
      wake()
      q.close()
    },
  }
}
