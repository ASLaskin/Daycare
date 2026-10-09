// The coordinator's private runtime directory, shared by the coordinator and its clients.

import os from "node:os"
import path from "node:path"
import { asFilePath, type FilePath } from "./ids.ts"

// DAYCARE_RUNTIME_DIR, else $XDG_RUNTIME_DIR/daycare; macOS has no XDG_RUNTIME_DIR, so its per-user temp folder
export const runtimeDir = (env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform, tmp: string = os.tmpdir()): string => {
  const dir = env["DAYCARE_RUNTIME_DIR"]
  if (dir) {
    return dir
  }
  const base = env["XDG_RUNTIME_DIR"]
  if (base) {
    return path.join(base, "daycare")
  }
  if (platform === "darwin") {
    return path.join(tmp, "daycare")
  }
  throw new Error("XDG_RUNTIME_DIR or DAYCARE_RUNTIME_DIR must be set")
}

export const socketPath = (dir: string): FilePath => asFilePath(path.join(dir, "coordinator.sock"))

// Holds the running coordinator's lock and process id
export const lockPath = (dir: string): FilePath => asFilePath(path.join(dir, "coordinator.lock"))
