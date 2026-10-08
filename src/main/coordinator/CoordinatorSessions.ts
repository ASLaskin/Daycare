// Sessions backed by the coordinator; IPC stays unchanged.

import { Context, Effect, Layer, Schema } from "effect"
import type { ChatEvent } from "../../shared/chat.ts"
import { Accepted, type Approval, type Command, Created, Provider, type SessionHistory } from "../../shared/coordinator.ts"
import { asSessionId, type RequestId, type SessionId } from "../../shared/ids.ts"
import type { NewMaster, SessionView } from "../../shared/session.ts"
import { ControlHandlers } from "../control/ControlHandlers.ts"
import { ToolError } from "../control/mcp.ts"
import { Sessions, type SessionsShape } from "../sessions/Sessions.ts"
import { Ui } from "../Ui.ts"
import { connect, socketPath } from "./client.ts"
import { pick, view } from "./view.ts"

const approvalKey = (session: SessionId, request: RequestId) => `${session} ${request}`

// Retained events as the renderer draws them
const restored = (h: SessionHistory): Array<ChatEvent> => {
  if ("error" in h) {
    return [{ kind: "error", message: h.error }]
  }
  return h.evicted ? [{ kind: "history-evicted" }, ...h.events] : [...h.events]
}

const make = (version: string) =>
  Effect.gen(function* () {
    const ui = yield* Ui
    // Provider for new chats; DAYCARE_PROVIDER=codex switches it
    const provider = Schema.decodeUnknownSync(Provider)(process.env["DAYCARE_PROVIDER"] ?? "claude")
    const sessions = new Map<SessionId, SessionView>()
    const history = new Map<SessionId, Array<ChatEvent>>()
    const choices = new Map<string, ReadonlyArray<string>>()

    const upsert = (v: SessionView) => {
      ui.send(sessions.has(v.id) ? "session:update" : "session:created", v)
      sessions.set(v.id, v)
    }

    const remember = (a: Approval) => choices.set(approvalKey(a.session, a.request), a.choices)

    const client = connect(socketPath(process.env), version, {
      status: (status) => ui.send("coordinator:status", status),
      snapshot: (snapshot) => {
        snapshot.sessions.forEach((s) => upsert(view(s)))
        Object.entries(snapshot.history).forEach(([raw, h]) => {
          const id = asSessionId(raw)
          const events = restored(h)
          history.set(id, events)
          ui.send("chat:reset", { id, events })
        })
        choices.clear()
        snapshot.approvals.forEach(remember)
      },
      event: (event) => {
        switch (event.kind) {
          case "session":
            upsert(view(event.session))
            return
          case "approval":
            remember(event.approval)
            return
          case "chat":
            if (event.event.kind === "permission-resolved") {
              choices.delete(approvalKey(event.session, event.event.requestId))
            }
            history.set(event.session, [...(history.get(event.session) ?? []), event.event])
            ui.send("chat:event", { id: event.session, event: event.event })
            return
        }
      },
    })
    yield* Effect.addFinalizer(() => Effect.sync(client.close))

    const request = (command: Command) => Effect.promise(() => client.request(command))

    const createMaster = (options: NewMaster): Effect.Effect<SessionView> =>
      request({
        method: "create",
        provider,
        cwd: options.cwd,
        prompt: options.task,
        ...(options.name ? { name: options.name } : {}),
        // The model setting names a Claude model; Codex uses its own default
        model: provider === "claude" ? options.model || null : null,
        permissionMode: options.permissionMode,
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Created)),
        Effect.orDie,
        Effect.flatMap(({ session }) => {
          const created = sessions.get(session)
          return created ? Effect.succeed(created) : Effect.die(new Error("coordinator did not report the new session"))
        }),
      )

    const service: SessionsShape = {
      list: Effect.sync(() => [...sessions.values()]),
      get: (id) => Effect.sync(() => sessions.get(id) ?? null),
      create: () => Effect.die(new Error("worker sessions are created by the coordinator")),
      createMaster,
      rename: () => Effect.logWarning("rename is not supported by the coordinator yet"),
      close: (id) => request({ method: "close", session: id }).pipe(Effect.asVoid),
      reopen: () => Effect.logWarning("reopen is not supported by the coordinator yet"),
      remove: (id) => request({ method: "close", session: id }).pipe(Effect.asVoid),
      // Resolves on coordinator acceptance, not provider delivery
      chatSend: (id, text) =>
        request({ method: "send", session: id, text }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Accepted)), Effect.orDie, Effect.asVoid),
      chatInterrupt: (id) => request({ method: "interrupt", session: id }).pipe(Effect.asVoid),
      chatRespond: (id, requestId, decision) => {
        const choice = pick(choices.get(approvalKey(id, requestId)) ?? [], decision)
        if (choice === null) {
          return Effect.succeed(false)
        }
        const command: Command = {
          method: "answer",
          session: id,
          request: requestId,
          choice,
          ...(decision.message === undefined ? {} : { message: decision.message }),
          ...(decision.updatedInput === undefined ? {} : { updatedInput: decision.updatedInput }),
        }
        return Effect.tryPromise(() => client.request(command)).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        )
      },
      chatHistory: (id) => Effect.sync(() => history.get(id) ?? []),
      restore: Effect.void,
      projectDirs: Effect.sync(() => [...new Set([...sessions.values()].map((s) => s.cwd))]),
    }

    const handlers = ControlHandlers.of({
      hook: () => Effect.void,
      tool: () => Effect.fail(new ToolError({ message: "orchestration runs in the coordinator" })),
    })
    return { service, handlers }
  })

// Also provides ControlHandlers, as Sessions.layer does
export const coordinatorSessions = (version: string) =>
  Layer.effectContext(
    make(version).pipe(Effect.map(({ service, handlers }) => Context.make(Sessions, service).pipe(Context.add(ControlHandlers, handlers)))),
  )
