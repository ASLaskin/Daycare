// Registered phones, their push tokens and Live Activity tokens.

import type { Database } from "bun:sqlite"
import { Exit, Schema } from "effect"
import { type ActivityId, type ApnsEnvironment, type ApnsToken, type DeviceId, PushKind } from "../../shared/mobile.ts"

export interface Device {
  readonly device: DeviceId
  readonly apnsToken: ApnsToken
  readonly environment: ApnsEnvironment
  readonly pushToStart: ApnsToken | null
  readonly kinds: ReadonlyArray<PushKind>
}

export interface ActivityToken {
  readonly activity: ActivityId
  readonly device: DeviceId
  readonly token: ApnsToken
}

interface DeviceRow {
  readonly device: DeviceId
  readonly apns_token: ApnsToken
  readonly environment: ApnsEnvironment
  readonly push_to_start: ApnsToken | null
  readonly kinds: string
}

const decodeKinds = Schema.decodeUnknownExit(Schema.fromJsonString(Schema.Array(PushKind)))

const kindsOf = (text: string): ReadonlyArray<PushKind> => {
  const decoded = decodeKinds(text)
  return Exit.isSuccess(decoded) ? decoded.value : []
}

export const makeDevices = (db: Database, now = Date.now) => ({
  register: (d: Device) => {
    db.query(
      `INSERT INTO mobile_devices (device, apns_token, environment, push_to_start, kinds, updated_at)
       VALUES ($device, $token, $environment, $pushToStart, $kinds, $at)
       ON CONFLICT (device) DO UPDATE SET apns_token = $token, environment = $environment,
         push_to_start = $pushToStart, kinds = $kinds, updated_at = $at`,
    ).run({ device: d.device, token: d.apnsToken, environment: d.environment, pushToStart: d.pushToStart, kinds: JSON.stringify(d.kinds), at: now() })
  },

  unregister: (device: DeviceId) =>
    db.transaction(() => {
      db.query("DELETE FROM mobile_devices WHERE device = $device").run({ device })
      db.query("DELETE FROM mobile_activities WHERE device = $device").run({ device })
    })(),

  list: (): ReadonlyArray<Device> =>
    db
      .query<DeviceRow, []>("SELECT device, apns_token, environment, push_to_start, kinds FROM mobile_devices")
      .all()
      .map((r) => ({ device: r.device, apnsToken: r.apns_token, environment: r.environment, pushToStart: r.push_to_start, kinds: kindsOf(r.kinds) })),

  // APNs refused the token for good
  dropToken: (token: ApnsToken) => {
    db.query("DELETE FROM mobile_devices WHERE apns_token = $token").run({ token })
    db.query("UPDATE mobile_devices SET push_to_start = NULL WHERE push_to_start = $token").run({ token })
    db.query("DELETE FROM mobile_activities WHERE token = $token").run({ token })
  },

  setActivity: (device: DeviceId, activity: ActivityId, token: ApnsToken) => {
    db.query(
      `INSERT INTO mobile_activities (activity, device, token, updated_at) VALUES ($activity, $device, $token, $at)
       ON CONFLICT (activity) DO UPDATE SET device = $device, token = $token, updated_at = $at`,
    ).run({ activity, device, token, at: now() })
  },

  endActivity: (activity: ActivityId) => {
    db.query("DELETE FROM mobile_activities WHERE activity = $activity").run({ activity })
  },

  activities: (): ReadonlyArray<ActivityToken> =>
    db.query<ActivityToken, []>("SELECT activity, device, token FROM mobile_activities").all(),
})

export type Devices = ReturnType<typeof makeDevices>
