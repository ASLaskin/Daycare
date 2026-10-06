import { Effect, Layer, type Scope, Stream } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AppPaths } from "../AppPaths.ts"
import { Power } from "../power/Power.ts"
import { Sessions } from "../sessions/Sessions.ts"
import { Ui } from "../Ui.ts"
import { Usage } from "../usage/Usage.ts"
import { MainWindow } from "./Window.ts"

const forward = <A>(changes: Effect.Effect<Stream.Stream<A>, never, Scope.Scope>, send: (a: A) => void) =>
  changes.pipe(
    Effect.flatMap((stream) => Stream.runForEach(stream, (a) => Effect.sync(() => send(a)))),
    Effect.forkScoped,
  )

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

    // Cmd+W must never reach Close Window.
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.meta && !input.shift && !input.alt && !input.control && input.key.toLowerCase() === "w") {
        event.preventDefault()
        ui.send("shortcut:close", undefined)
      }
    })

    const loaded = Effect.promise(() => win.loadFile(path.join(appRoot, "dist", "renderer", "index.html")))
    yield* loaded
    yield* sessions.restore
    // Later fetches follow finished turns.
    yield* Effect.forkScoped(usage.refresh())
    yield* devHooks
  }),
)

// Dev hooks, see README.
const devHooks = Effect.gen(function* () {
  const { win } = yield* MainWindow
  const sessions = yield* Sessions
  const env = process.env
  const run = (effect: Effect.Effect<unknown>) => void Effect.runFork(effect)

  if (env["DAYCARE_AUTOSTART"]) {
    const auto = JSON.parse(env["DAYCARE_AUTOSTART"])
    setTimeout(
      () => run(sessions.createMaster({ task: "", kind: "terminal", model: "sonnet", permissionMode: "default", cwd: os.homedir(), name: "Master", ...auto })),
      500,
    )
  }
  if (env["DAYCARE_DEMO"]) {
    const d = JSON.parse(env["DAYCARE_DEMO"])
    const cwd = d.cwd || os.homedir()
    setTimeout(
      () =>
        run(
          Effect.gen(function* () {
            const m = yield* sessions.createMaster({ task: "", kind: d.kind || "terminal", cwd, model: "sonnet", permissionMode: "default", name: d.name })
            for (let i = 0; i < (d.workers || 0); i++) {
              yield* sessions.create({ role: "worker", name: `Worker ${i + 1}`, kind: d.workerKind || d.kind || "terminal", cwd, model: "sonnet", permissionMode: "default", parentId: m.id })
            }
          }),
        ),
      600,
    )
  }
  if (env["DAYCARE_EVAL"]) {
    for (const [ms, js] of JSON.parse(env["DAYCARE_EVAL"]) as Array<[number, string]>) {
      setTimeout(() => win.webContents.executeJavaScript(js).catch(() => {}), ms)
    }
  }
  const dir = env["DAYCARE_SNAPSHOT"]
  if (dir) {
    let n = 0
    setInterval(async () => {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(dir, `shot-${n++}.png`), img.toPNG())
      fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(await Effect.runPromise(sessions.list), null, 2))
    }, 5000)
  }
})
