// Keep awake settings and inputs.

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

export interface PowerInput {
  readonly mode: KeepAwake
  readonly lidClosed: boolean
  readonly activeCount: number
  readonly busyCount: number
}
