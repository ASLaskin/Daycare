// Lid closed keep awake settings and inputs.

import type { KeepAwake } from "../../shared/settings.ts"

export interface PowerConfig {
  readonly osascript: string
  readonly pmset: string
  // File whose appearance makes the watchdog revert.
  readonly sentinel: string
  // How long lid close stays on after work ends.
  readonly lidGraceMs: number
  readonly isMac: boolean
}

export const defaultPowerConfig = (sentinel: string): PowerConfig => ({
  osascript: "/usr/bin/osascript",
  pmset: "/usr/bin/pmset",
  sentinel,
  lidGraceMs: 600000,
  isMac: process.platform === "darwin",
})

// Coordinator mode and busy count, plus the desktop setting
export interface LidInput {
  readonly mode: KeepAwake
  readonly busyCount: number
  readonly lidClosed: boolean
}

export interface LidStatus {
  readonly enabled: boolean
  readonly active: boolean
  // disablesleep left on by an earlier run
  readonly stale: boolean
  readonly error: string | null
}
