// Idle system sleep assertion held by caffeinate.

import { type ChildProcess, spawn } from "node:child_process"

export const CAFFEINATE = "/usr/bin/caffeinate"

export interface Assertion {
  // onLost runs if the assertion ends without release
  readonly hold: (onLost: (reason: string) => void) => void
  readonly release: () => void
  readonly held: () => boolean
}

// Never holds; for platforms without caffeinate and for tests
export const noAssertion: Assertion = { hold: () => {}, release: () => {}, held: () => false }

// Idle sleep blocked, display free; ends with pid
export const caffeinate = (command: string = CAFFEINATE, pid: number = process.pid): Assertion => {
  let child: ChildProcess | null = null

  const hold = (onLost: (reason: string) => void) => {
    if (child) {
      return
    }
    const spawned = spawn(command, ["-i", "-w", String(pid)], { stdio: "ignore" })
    child = spawned
    const lost = (reason: string) => {
      if (child === spawned) {
        child = null
        onLost(reason)
      }
    }
    spawned.on("error", (e) => lost(`Keep awake failed: ${e.message}`))
    spawned.on("exit", (code, signal) => lost(`Keep awake stopped unexpectedly (${signal ?? `exit ${code}`})`))
  }

  const release = () => {
    const running = child
    child = null
    running?.kill()
  }

  return { hold, release, held: () => child !== null }
}
