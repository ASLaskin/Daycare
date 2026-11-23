// Starts the coordinator under systemd on Linux, launchd on macOS.

import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import type { DirPath } from "../../shared/ids.ts"
import { lockPath, runtimeDir } from "../../shared/runtime.ts"
import { reloadAgent, startAgent } from "./launchd.ts"
import type { CoordinatorSetup } from "./paths.ts"
import { restartService, startService } from "./systemd.ts"

const STOP_WAIT_MS = 20_000

const ps = (pid: number, field: string) => execFileSync("ps", ["-p", String(pid), "-o", `${field}=`], { encoding: "utf8" }).trim()

// Pid from the lock file, if still that coordinator
const runningCoordinator = (): number | null => {
  try {
    const file = lockPath(runtimeDir(process.env))
    const pid = Number(readFileSync(file, "utf8").trim())
    const started = Date.parse(ps(pid, "lstart"))
    const writtenAfterStart = started <= statSync(file).mtimeMs + 1000
    return pid > 0 && writtenAfterStart && ps(pid, "command").includes("coordinator/main.") ? pid : null
  } catch {
    return null
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export const startCoordinator = (setup: CoordinatorSetup, home: DirPath) => {
  if (process.platform === "linux") {
    startService(setup, home)
    return
  }
  startAgent(setup, home, runningCoordinator() !== null)
}

// SIGTERM, then wait; exit 0 keeps launchd from restarting it
const stopRunning = async () => {
  const pid = runningCoordinator()
  if (!pid) {
    return
  }
  process.kill(pid, "SIGTERM")
  const deadline = Date.now() + STOP_WAIT_MS
  while (alive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (alive(pid)) {
    throw new Error(`the coordinator did not stop within ${STOP_WAIT_MS / 1000} seconds; try again`)
  }
}

// Restarts it with the current config, interrupting running work
export const restartCoordinator = async (setup: CoordinatorSetup, home: DirPath) => {
  if (process.platform === "linux") {
    restartService()
    return
  }
  await stopRunning()
  reloadAgent(setup, home)
}
