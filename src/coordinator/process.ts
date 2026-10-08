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

const exited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null

// Waits up to the grace for the leader to exit, then kills what is left of its group
export const stopGroup = async (child: ChildProcess, graceMs = STOP_GRACE_MS) => {
  if (!exited(child)) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, graceMs)
      child.once("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
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
}
