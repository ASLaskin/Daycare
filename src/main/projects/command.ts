// Run a custom button command in a folder.

import { spawn } from "node:child_process"
import type { DirPath } from "../../shared/ids.ts"

export const runCommand = (dir: DirPath, command: string) => {
  const child = spawn(process.env.SHELL || "/bin/sh", ["-lc", command], { cwd: dir, detached: true, stdio: "ignore" })
  child.on("error", () => {})
  child.unref()
}
