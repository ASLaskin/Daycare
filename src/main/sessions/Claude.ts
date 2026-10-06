// Path to the claude binary.

import { Context, Effect, Layer } from "effect"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { asFilePath, type FilePath } from "../../shared/ids.ts"

export class ClaudeBinary extends Context.Service<ClaudeBinary, { readonly path: FilePath }>()("daycare/ClaudeBinary") {
  // Find claude on the login PATH, or DAYCARE_CLAUDE
  static readonly layer = Layer.effect(
    ClaudeBinary,
    Effect.sync(() => {
      const override = process.env["DAYCARE_CLAUDE"]
      if (override) {
        return { path: asFilePath(override) }
      }
      try {
        return { path: asFilePath(execFileSync("/bin/zsh", ["-lc", "command -v claude"], { encoding: "utf8" }).trim()) }
      } catch {
        return { path: asFilePath(path.join(os.homedir(), ".local", "bin", "claude")) }
      }
    }),
  )
}
