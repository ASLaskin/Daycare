// Settings > Update: pull, rebuild, reinstall and reopen.

import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { app } from "electron"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { asDirPath } from "../../shared/ids.ts"
import { BuildInfo, type UpdateResult } from "../../shared/ipc.ts"
import { AppPaths } from "../AppPaths.ts"
import { Ui } from "../Ui.ts"

export class Updater extends Context.Service<
  Updater,
  {
    readonly info: Effect.Effect<BuildInfo | null>
    readonly run: Effect.Effect<UpdateResult>
  }
>()("daycare/Updater") {
  static readonly layer = Layer.effect(
    Updater,
    Effect.gen(function* () {
      const { appRoot } = yield* AppPaths
      const ui = yield* Ui
      // One update at a time.
      const lock = yield* Semaphore.make(1)

      // Build info from dist, or the checkout itself in dev.
      const info = Effect.sync((): BuildInfo | null => {
        try {
          return Schema.decodeUnknownSync(Schema.fromJsonString(BuildInfo))(fs.readFileSync(path.join(appRoot, "dist", "build-info.json"), "utf8"))
        } catch {
          return app.isPackaged ? null : { sourceDir: asDirPath(appRoot), commit: null, builtAt: null }
        }
      })

      const script = (child: ReturnType<typeof spawn>) =>
        Effect.callback<{ code: number | null; log: string }>((resume) => {
          const log: Array<string> = []
          const push = (chunk: Buffer | string) => {
            log.push(String(chunk))
            ui.send("update:log", String(chunk))
          }
          child.stdout?.on("data", push)
          child.stderr?.on("data", push)
          child.on("error", (err) => push(err.message))
          child.on("close", (code) => resume(Effect.succeed({ code, log: log.join("") })))
        })

      const run = Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const current = yield* info
          if (!current?.sourceDir || !fs.existsSync(path.join(current.sourceDir, "scripts", "update.sh"))) {
            return { ok: false, log: "Cannot find the source folder this app was built from." }
          }
          const { code, log } = yield* script(spawn("/bin/zsh", ["-lc", "./scripts/update.sh"], { cwd: current.sourceDir }))
          if (code !== 0) {
            return { ok: false, log }
          }
          const installed = log.match(/Installed (.+\.app)/)?.[1]
          if (app.isPackaged && installed) {
            setTimeout(() => {
              spawn("open", ["-n", installed], { detached: true, stdio: "ignore" }).unref()
              app.quit()
            }, 800)
          }
          return { ok: true, log }
        }),
      )

      return Updater.of({ info, run })
    }),
  )
}
