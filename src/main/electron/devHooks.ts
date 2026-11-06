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
const SNAPSHOT_EVERY_MS = 5000

const Autostart = Schema.Struct({
  task: Schema.optionalKey(Schema.String),
  cwd: Schema.optionalKey(DirPath),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
  permissionMode: Schema.optionalKey(PermissionMode),
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
      effort: "",
      permissionMode: "default" as const,
      cwd: asDirPath(os.homedir()),
      name: "Master",
      ...auto,
    }
    setTimeout(() => run(sessions.createMaster(options)), AUTOSTART_DELAY_MS)
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
