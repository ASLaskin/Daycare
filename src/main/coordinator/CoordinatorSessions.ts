// Sessions backed by the coordinator; IPC stays unchanged.

import { Context, Effect, Layer, Schema } from "effect"
import type { ChatEvent } from "../../shared/chat.ts"
import { Accepted, type Approval, type Command, Created, type SessionHistory } from "../../shared/coordinator.ts"
import { asSessionId, type RequestId, type SessionId } from "../../shared/ids.ts"
import type { NewMaster, SessionView } from "../../shared/session.ts"
import { ControlHandlers } from "../control/ControlHandlers.ts"
import { ToolError } from "../control/mcp.ts"
import { Sessions, type SessionsShape } from "../sessions/Sessions.ts"
import { deleteDetail } from "../sessions/service.ts"
import { Ui } from "../Ui.ts"
import { runtimeDir, socketPath } from "../../shared/runtime.ts"
import { AppPaths } from "../AppPaths.ts"
import { connect } from "./client.ts"
import { restartCoordinator, startCoordinator } from "./launch.ts"
import { coordinatorSetup } from "./paths.ts"
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
    const { appRoot, home } = yield* AppPaths
    // Why the coordinator could not be started, shown instead of a bare socket error
    let launchError: string | null = null
    const setup = () => coordinatorSetup(appRoot, home)
    try {
      startCoordinator(setup(), home)
    } catch (e) {
      launchError = `Could not start the coordinator: ${e instanceof Error ? e.message : String(e)}`
      console.error(launchError)
    }
    const sessions = new Map<SessionId, SessionView>()
    const history = new Map<SessionId, Array<ChatEvent>>()
    const choices = new Map<string, ReadonlyArray<string>>()

    const upsert = (v: SessionView) => {
      const before = sessions.get(v.id)
      // A reopened session needs its pane again, as the in-Electron path sends
      const created = !before || (before.status === "closed" && v.status !== "closed")
      ui.send(created ? "session:created" : "session:update", v)
      sessions.set(v.id, v)
    }

    const drop = (id: SessionId, parentId: SessionId | null) => {
      sessions.delete(id)
      history.delete(id)
      ui.send("session:removed", { id, parentId })
    }

    const remember = (a: Approval) => choices.set(approvalKey(a.session, a.request), a.choices)

    const client = connect(socketPath(runtimeDir(process.env)), version, {
      status: (status) => ui.send("coordinator:status", status.state === "unavailable" && launchError ? { state: "unavailable", message: launchError } : status),
      snapshot: (snapshot) => {
        // Deleted while this window was away
        const present = new Set(snapshot.sessions.map((s) => s.id))
        ;[...sessions.values()].filter((v) => !present.has(v.id)).forEach((v) => drop(v.id, v.parentId))
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
          case "removed":
            drop(event.session, event.parentId)
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

    const createMaster = (options: NewMaster): Effect.Effect<SessionView> => {
      const provider = options.provider ?? "claude"
      return request({
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
    }

    const service: SessionsShape = {
      list: Effect.sync(() => [...sessions.values()]),
      get: (id) => Effect.sync(() => sessions.get(id) ?? null),
      create: () => Effect.die(new Error("worker sessions are created by the coordinator")),
      createMaster,
      rename: (id, name) => request({ method: "rename", session: id, name }).pipe(Effect.asVoid),
      close: (id) => request({ method: "close", session: id }).pipe(Effect.asVoid),
      reopen: (id) => request({ method: "reopen", session: id }).pipe(Effect.asVoid),
      // Asks first unless it is a master nobody has used yet, as the in-Electron path does
      remove: (id) =>
        Effect.gen(function* () {
          const s = sessions.get(id)
          if (!s) {
            return
          }
          const workers = s.role === "master" ? [...sessions.values()].filter((w) => w.parentId === id).length : 0
          const pristine = s.role === "master" && !s.hadTurn && workers === 0
          const ok = pristine || (yield* ui.confirm({ message: `Delete ${s.name}?`, detail: deleteDetail(workers), confirmLabel: "Delete" }))
          if (ok) {
            yield* request({ method: "remove", session: id })
          }
        }),
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
      restartCoordinator: Effect.tryPromise(() => restartCoordinator(setup(), home)).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            launchError = null
          }),
        ),
        Effect.orDie,
      ),
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
