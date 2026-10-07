// Launch time dev helpers driven by DAYCARE_ environment variables.

import { Effect, Schema } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { asDirPath, DirPath } from "../../shared/ids.ts"
import { PermissionMode } from "../../shared/session.ts"
import { Sessions } from "../sessions/Sessions.ts"
import { MainWindow } from "./Window.ts"

const AUTOSTART_DELAY_MS = 500
const DEMO_DELAY_MS = 600
const SNAPSHOT_EVERY_MS = 5000

const Autostart = Schema.Struct({
  task: Schema.optionalKey(Schema.String),
  cwd: Schema.optionalKey(DirPath),
  model: Schema.optionalKey(Schema.String),
  permissionMode: Schema.optionalKey(PermissionMode),
  name: Schema.optionalKey(Schema.String),
})

const Demo = Schema.Struct({
  workers: Schema.optionalKey(Schema.Int),
  cwd: Schema.optionalKey(DirPath),
  name: Schema.optionalKey(Schema.String),
})

const Evals = Schema.Array(Schema.Tuple([Schema.Number, Schema.String]))

const fromEnv = <A, I>(schema: Schema.Codec<A, I>, raw: string) => Schema.decodeUnknownSync(Schema.fromJsonString(schema))(raw)

export const devHooks = Effect.gen(function* () {
  const { win } = yield* MainWindow
  const sessions = yield* Sessions
  const env = process.env
  const run = <A>(effect: Effect.Effect<A>) => void Effect.runFork(effect)

  // DAYCARE_AUTOSTART: start one master
  const autostart = env["DAYCARE_AUTOSTART"]
  if (autostart) {
    const auto = fromEnv(Autostart, autostart)
    const options = {
      task: "",
      model: "sonnet",
      permissionMode: "default" as const,
      cwd: asDirPath(os.homedir()),
      name: "Master",
      ...auto,
    }
    setTimeout(() => run(sessions.createMaster(options)), AUTOSTART_DELAY_MS)
  }

  // DAYCARE_DEMO: a master with idle workers
  const demo = env["DAYCARE_DEMO"]
  if (demo) {
    const d = fromEnv(Demo, demo)
    const cwd = d.cwd || asDirPath(os.homedir())
    const startDemo = Effect.gen(function* () {
      const m = yield* sessions.createMaster({ task: "", cwd, model: "sonnet", permissionMode: "default", ...(d.name ? { name: d.name } : {}) })
      yield* Effect.forEach(Array.from({ length: d.workers || 0 }, (_, i) => i + 1), (n) =>
        sessions.create({ role: "worker", name: `Worker ${n}`, cwd, model: "sonnet", permissionMode: "default", parentId: m.id }),
      )
    })
    setTimeout(() => run(startDemo), DEMO_DELAY_MS)
  }

  // DAYCARE_EVAL: renderer scripts at given delays
  const evals = env["DAYCARE_EVAL"]
  if (evals) {
    const scripts = fromEnv(Evals, evals)
    scripts.forEach(([ms, js]) => setTimeout(() => win.webContents.executeJavaScript(js).catch(() => {}), ms))
  }

  // DAYCARE_SNAPSHOT: periodic screenshot and session state
  const dir = env["DAYCARE_SNAPSHOT"]
  if (dir) {
    let n = 0
    const timer = setInterval(async () => {
      if (win.isDestroyed()) {
        return clearInterval(timer)
      }
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(dir, `shot-${n++}.png`), img.toPNG())
      fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(await Effect.runPromise(sessions.list), null, 2))
    }, SNAPSHOT_EVERY_MS)
  }
})
