// Provider processes, each leading its own process group.

import { type ChildProcess, spawn } from "node:child_process"

export const STOP_GRACE_MS = 5000

export interface GroupOptions {
  readonly cwd?: string
  readonly env: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
}

// Leader of a new process group; children that start their own group are not covered
export const spawnGroup = (command: string, args: ReadonlyArray<string>, options: GroupOptions) =>
  spawn(command, args, { ...options, detached: true, stdio: ["pipe", "pipe", "inherit"] })

// How long to wait for the leader to exit once killed
const KILL_WAIT_MS = 2000

const exited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null

const exitWithin = (child: ChildProcess, ms: number) =>
  exited(child)
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms)
        child.once("exit", () => {
          clearTimeout(timer)
          resolve()
        })
      })

// Waits up to the grace for the leader to exit, kills what is left of its group, then waits for the leader
export const stopGroup = async (child: ChildProcess, graceMs = STOP_GRACE_MS) => {
  await exitWithin(child, graceMs)
  if (!child.pid) {
    return
  }
  // ponytail: a group id can be reused once every member exits; a per-session cgroup removes that race
  try {
    process.kill(-child.pid, "SIGKILL")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ESRCH") {
      throw e
    }
  }
  await exitWithin(child, KILL_WAIT_MS)
  if (!exited(child)) {
    throw new Error(`process ${child.pid} did not exit after SIGKILL`)
  }
}
