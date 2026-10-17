// Starts the coordinator: a user service on Linux, a detached process on macOS.

import { execFileSync, spawn } from "node:child_process"
import { lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"
import { lockPath, runtimeDir } from "../../shared/runtime.ts"
import type { CoordinatorSetup } from "./paths.ts"

export const UNIT = "daycare-coordinator.service"

// Quotes paths for systemd
const quote = (value: string) => `"${value.replace(/[\\"]/g, "\\$&").replace(/%/g, "%%")}"`

export const unitFile = (setup: CoordinatorSetup) =>
  [
    "# Written by Daycare on each launch; edits are overwritten.",
    "",
    "[Unit]",
    "Description=Daycare coordinator",
    "",
    "[Service]",
    `ExecStart=${quote(setup.bun)} ${quote(setup.script)}`,
    ...Object.entries(setup.env).map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`),
    "# Stop signals the coordinator alone, then kills whatever remains in the unit's cgroup",
    "KillMode=mixed",
    "TimeoutStopSec=15",
    "Restart=on-failure",
    "# Exit 3: another coordinator already owns the runtime directory",
    "RestartPreventExitStatus=3",
    "",
  ].join("\n")

const unitPath = (home: DirPath) => path.join(process.env["XDG_CONFIG_HOME"] || path.join(home, ".config"), "systemd", "user", UNIT)

// Rewrites the unit only when changed
const writeUnit = (file: string, text: string) => {
  const link = lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
  const current = link ? null : (() => {
    try {
      return readFileSync(file, "utf8")
    } catch {
      return null
    }
  })()
  if (current === text) {
    return false
  }
  mkdirSync(path.dirname(file), { recursive: true })
  rmSync(file, { force: true })
  writeFileSync(file, text)
  return true
}

const systemctl = (...args: ReadonlyArray<string>) => execFileSync("systemctl", ["--user", ...args], { stdio: "pipe", timeout: 15_000 })

export const startCoordinator = (setup: CoordinatorSetup, home: DirPath) => {
  if (process.platform === "linux") {
    if (writeUnit(unitPath(home), unitFile(setup))) {
      systemctl("daemon-reload")
    }
    systemctl("start", UNIT)
    return
  }
  spawn(setup.bun, [setup.script], { detached: true, stdio: "ignore", env: { ...process.env, ...setup.env } }).unref()
}

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

// Restarts it, interrupting running work
export const restartCoordinator = async (setup: CoordinatorSetup, home: DirPath) => {
  if (process.platform === "linux") {
    systemctl("restart", UNIT)
    return
  }
  const pid = runningCoordinator()
  if (pid) {
    process.kill(pid, "SIGTERM")
    const deadline = Date.now() + STOP_WAIT_MS
    while (alive(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (alive(pid)) {
      throw new Error(`the coordinator did not stop within ${STOP_WAIT_MS / 1000} seconds; try again`)
    }
  }
  startCoordinator(setup, home)
}
