// Sessions service: wires state, handlers and background work.

import { Context, Effect, Layer, Schedule, Stream } from "effect"
import { AppPaths } from "../AppPaths.ts"
import { Chat } from "../chat/Chat.ts"
import { ControlHandlers } from "../control/ControlHandlers.ts"
import { ControlEndpoint } from "../control/ControlServer.ts"
import { Power } from "../power/Power.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { Ui } from "../Ui.ts"
import { Usage } from "../usage/Usage.ts"
import { makeChatEventHandler } from "./chatEvents.ts"
import { ClaudeBinary } from "./Claude.ts"
import { makeCore } from "./core.ts"
import { makeHookHandler } from "./hooks.ts"
import { makeLifecycle } from "./lifecycle.ts"
import { makeToolHandler } from "./orchestration.ts"
import { Pty } from "./Pty.ts"
import { makeService, type SessionsShape } from "./service.ts"

export type { SessionsShape }

const make = Effect.gen(function* () {
  const core = makeCore({
    chat: yield* Chat,
    power: yield* Power,
    settings: yield* SettingsStore,
    usage: yield* Usage,
    ui: yield* Ui,
    pty: yield* Pty,
    claude: yield* ClaudeBinary,
    endpoint: yield* ControlEndpoint,
    paths: yield* AppPaths,
  })
  const lifecycle = makeLifecycle(core)
  const onChatEvent = makeChatEventHandler(core, lifecycle)
  const onHook = makeHookHandler(core)
  const { chat, settings } = core.deps

  yield* chat.subscribe.pipe(
    Effect.flatMap((events) => Stream.runForEach(events, ({ id, event }) => Effect.sync(() => onChatEvent(id, event)))),
    Effect.forkScoped,
  )

  // Poll context of working terminals between hooks
  yield* Effect.sync(() =>
    [...core.sessions.values()].filter((s) => s.status === "working" && s.kind !== "chat").forEach(core.refreshContext),
  ).pipe(Effect.repeat(Schedule.spaced("2 seconds")), Effect.forkScoped)

  yield* settings.changes.pipe(
    Effect.flatMap((changes) => Stream.runForEach(changes, () => Effect.sync(core.syncPower))),
    Effect.forkScoped,
  )

  // Save and stop terminals on quit
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      core.quit()
      core.persist()
      ;[...core.sessions.values()].filter((s) => s.kind === "terminal").forEach((s) => s.proc?.kill())
    }),
  )

  const handlers = ControlHandlers.of({
    hook: (id, payload) => Effect.sync(() => onHook(id, payload)),
    tool: makeToolHandler(core, lifecycle),
  })

  return { service: makeService(core, lifecycle), handlers }
})

export class Sessions extends Context.Service<Sessions, SessionsShape>()("daycare/Sessions") {
  // Also provides ControlHandlers
  static readonly layer = Layer.effectContext(
    make.pipe(Effect.map(({ service, handlers }) => Context.make(Sessions, service).pipe(Context.add(ControlHandlers, handlers)))),
  )
}
