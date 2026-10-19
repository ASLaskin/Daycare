// Startup once the window and services exist.

import { Effect, Layer, type Scope, Stream } from "effect"
import path from "node:path"
import { AppPaths } from "../AppPaths.ts"
import { Power } from "../power/Power.ts"
import { Sessions } from "../sessions/Sessions.ts"
import { Ui } from "../Ui.ts"
import { Usage } from "../usage/Usage.ts"
import { resolveBindings } from "../../shared/shortcuts/bindings.ts"
import { pressCombo } from "../../shared/shortcuts/combo.ts"
import { devHooks } from "./devHooks.ts"
import { MainWindow } from "./Window.ts"

const forward = <A>(changes: Effect.Effect<Stream.Stream<A>, never, Scope.Scope>, send: (a: A) => void) =>
  changes.pipe(
    Effect.flatMap((stream) => Stream.runForEach(stream, (a) => Effect.sync(() => send(a)))),
    Effect.forkScoped,
  )

const mac = process.platform === "darwin"
const closeKeys = resolveBindings({}, mac).get("closeSession") ?? []

const isCloseShortcut = (input: Electron.Input) => {
  if (input.type !== "keyDown") {
    return false
  }
  const combo = pressCombo({ key: input.key, code: input.code, meta: input.meta, ctrl: input.control, alt: input.alt, shift: input.shift }, mac)
  return combo !== null && closeKeys.includes(combo)
}

export const Boot = Layer.effectDiscard(
  Effect.gen(function* () {
    const { win } = yield* MainWindow
    const { appRoot } = yield* AppPaths
    const ui = yield* Ui
    const sessions = yield* Sessions
    const usage = yield* Usage
    const power = yield* Power

    yield* forward(usage.changes, (u) => ui.send("usage:update", u))
    yield* forward(power.changes, (p) => ui.send("power:update", p))

    // Close session shortcut closes the active master, not the window
    win.webContents.on("before-input-event", (event, input) => {
      if (!isCloseShortcut(input)) {
        return
      }
      event.preventDefault()
      ui.send("shortcut:close", undefined)
    })

    yield* Effect.promise(() => win.loadFile(path.join(appRoot, "dist", "renderer", "index.html")))
    yield* sessions.restore
    // Usage on launch
    yield* Effect.forkScoped(usage.refresh())
    yield* devHooks
  }),
)
