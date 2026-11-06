// Coordinator power state and the desktop's view of it.

import { Schema } from "effect"
import { KeepAwake } from "./settings.ts"

// One battery reading from pmset
export const Battery = Schema.Struct({
  percent: Schema.Int,
  // Drawing from the power adapter
  pluggedIn: Schema.Boolean,
  charging: Schema.Boolean,
  // To empty when discharging, to full when charging; null while estimating
  minutesRemaining: Schema.NullOr(Schema.Int),
  // Epoch ms of the reading
  readAt: Schema.Number,
})
export type Battery = typeof Battery.Type

// Desktop lid closed keep awake, behind an admin prompt
export const LidClosed = Schema.Struct({
  // Desktop setting is on
  enabled: Schema.Boolean,
  // System sleep is disabled right now
  active: Schema.Boolean,
})
export type LidClosed = typeof LidClosed.Type

// Coordinator owned keep awake and battery state
export const PowerState = Schema.Struct({
  // Idle sleep keep awake; any client may set it
  mode: KeepAwake,
  // Idle sleep assertion held now; display may still sleep
  holding: Schema.Boolean,
  busyCount: Schema.Int,
  // Null on Macs without a battery
  battery: Schema.NullOr(Battery),
  // Desktop only and read only elsewhere; null without a desktop
  lidClosed: Schema.NullOr(LidClosed),
  error: Schema.NullOr(Schema.String),
})
export type PowerState = typeof PowerState.Type

// Settings view: coordinator state plus the desktop's lid closed machine
export interface PowerStatus {
  // Null while the coordinator is unreachable
  readonly power: PowerState | null
  readonly lidClosedActive: boolean
  // disablesleep left on by an earlier run
  readonly stale: boolean
  readonly error: string | null
}
