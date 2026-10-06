// Keep awake state as the Settings screen shows it.

import type { KeepAwake } from "./settings.ts"

export interface PowerStatus {
  readonly mode: KeepAwake
  readonly holding: boolean
  readonly activeCount: number
  readonly busyCount: number
  readonly lidClosed: boolean
  readonly lidClosedActive: boolean
  readonly stale: boolean
  readonly error: string | null
}
