// Chat service over all chat child processes.

import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"
import { randomUUID } from "node:crypto"
import type { ChatEvent } from "../../shared/chat.ts"
import type { ClaudeSessionId, FilePath, RequestId, SessionId } from "../../shared/ids.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import { ChatProcess, type ChatStart } from "./ChatProcess.ts"
import type { StreamNormalizer } from "./normalize.ts"
import { HISTORY_MAX } from "./transcript.ts"

export type { ChatStart }

export interface ChatMessage {
  readonly id: SessionId
  readonly event: ChatEvent
}

export interface ChatInfo {
  readonly state: StreamNormalizer["state"]
  readonly claudeSessionId: ClaudeSessionId | null
  readonly model: string | null
  readonly cwd: string | null
  readonly costUsd: number
  readonly contextTokens: number
  readonly tools: ReadonlyArray<string>
}

export interface ChatShape {
  // Stream of every chat's events.
  readonly subscribe: Effect.Effect<Stream.Stream<ChatMessage>, never, Scope.Scope>
  readonly start: (opts: ChatStart) => Effect.Effect<void>
  readonly send: (id: SessionId, text: string) => Effect.Effect<void>
  readonly interrupt: (id: SessionId) => Effect.Effect<void>
  readonly respond: (id: SessionId, requestId: RequestId, decision: PermissionDecision) => Effect.Effect<boolean>
  readonly stop: (id: SessionId) => Effect.Effect<void>
  readonly has: (id: SessionId) => Effect.Effect<boolean>
  readonly history: (id: SessionId) => Effect.Effect<ReadonlyArray<ChatEvent>>
  readonly info: (id: SessionId) => Effect.Effect<ChatInfo | null>
}

const make = (claudePath: FilePath) =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<ChatMessage>()
    const chats = new Map<SessionId, ChatProcess>()
    const live = (id: SessionId) => {
      const c = chats.get(id)
      return c && !c.exited && !c.stopping ? c : null
    }

    yield* Effect.addFinalizer(() => Effect.sync(() => chats.forEach((c) => c.kill())))

    const start = (opts: ChatStart) =>
      Effect.sync(() => {
        const prev = chats.get(opts.id)
        if (prev && !prev.exited) {
          return
        }
        const c: ChatProcess = new ChatProcess(
          opts.id,
          opts,
          claudePath,
          (event) => PubSub.publishUnsafe(pubsub, { id: opts.id, event }),
          () => {
            if (chats.get(opts.id) === c) {
              chats.delete(opts.id)
            }
          },
        )
        chats.set(opts.id, c)
      })

    const send = (id: SessionId, text: string) =>
      Effect.sync(() => {
        const c = live(id)
        if (!c) {
          return
        }
        c.emitAll([{ kind: "user", text }])
        c.write({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })
      })

    const interrupt = (id: SessionId) =>
      Effect.sync(() => live(id)?.write({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } }))

    const respond = (id: SessionId, requestId: RequestId, decision: PermissionDecision) =>
      Effect.sync(() => {
        const c = chats.get(id)
        const pending = c?.normalizer.permissions.get(requestId)
        if (!c || !pending || c.exited) {
          return false
        }
        const response = decision.allow
          ? {
              behavior: "allow",
              updatedInput: decision.updatedInput ?? pending.input,
              ...(decision.updatedPermissions ? { updatedPermissions: decision.updatedPermissions } : {}),
            }
          : { behavior: "deny", message: decision.message || "Denied by the user", interrupt: false }
        c.write({ type: "control_response", response: { subtype: "success", request_id: requestId, response } })
        c.emitAll(c.normalizer.resolvePermission(requestId, decision.allow))
        return true
      })

    const info = (id: SessionId) =>
      Effect.sync((): ChatInfo | null => {
        const n = chats.get(id)?.normalizer
        return n
          ? { state: n.state, claudeSessionId: n.claudeSessionId, model: n.model, cwd: n.cwd, costUsd: n.costUsd, contextTokens: n.contextTokens, tools: n.tools }
          : null
      })

    return Chat.of({
      subscribe: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      start,
      send,
      interrupt,
      respond,
      stop: (id) => Effect.sync(() => chats.get(id)?.stop()),
      has: (id) => Effect.sync(() => chats.has(id)),
      history: (id) => Effect.sync(() => chats.get(id)?.events.slice(-HISTORY_MAX) ?? []),
      info,
    })
  })

export class Chat extends Context.Service<Chat, ChatShape>()("daycare/Chat") {
  static readonly layer = (claudePath: FilePath) => Layer.effect(Chat, make(claudePath))
}
