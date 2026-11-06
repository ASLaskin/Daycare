// Stored command results by request key, kept 7 days.

import type { Database } from "bun:sqlite"
import { Exit, Schema } from "effect"
import type { DeviceId, RequestKey } from "../../shared/mobile.ts"
import { fail, Outcome } from "./outcome.ts"

export const KEEP_MS = 7 * 24 * 60 * 60 * 1000
const PRUNE_EVERY_MS = 60 * 60 * 1000

const decodeOutcome = Schema.decodeUnknownExit(Schema.fromJsonString(Outcome))

export interface Keyed {
  readonly outcome: Outcome
  readonly replayed: boolean
}

// Only successes and refusals are final
const storable = (o: Outcome) => !("error" in o) || o.error.code === "rejected"

export const makeIdempotency = (db: Database, now = Date.now) => {
  const running = new Map<string, { readonly method: string; readonly done: Promise<Outcome> }>()
  let pruned = 0

  const prune = () => {
    if (now() - pruned < PRUNE_EVERY_MS) {
      return
    }
    pruned = now()
    db.query("DELETE FROM mobile_requests WHERE created_at < $cutoff").run({ cutoff: now() - KEEP_MS })
  }

  const stored = (device: DeviceId, key: RequestKey) =>
    db
      .query<{ method: string; result: string }, { device: DeviceId; key: RequestKey; cutoff: number }>(
        "SELECT method, result FROM mobile_requests WHERE device = $device AND key = $key AND created_at >= $cutoff",
      )
      .get({ device, key, cutoff: now() - KEEP_MS })

  const save = (device: DeviceId, key: RequestKey, method: string, outcome: Outcome) => {
    prune()
    db.query(
      `INSERT INTO mobile_requests (key, device, method, result, created_at) VALUES ($key, $device, $method, $result, $at)
       ON CONFLICT (device, key) DO UPDATE SET method = $method, result = $result, created_at = $at`,
    ).run({ key, device, method, result: JSON.stringify(outcome), at: now() })
  }

  return {
    // Runs work once per key; repeats get the first outcome
    run: async (device: DeviceId, key: RequestKey, method: string, work: () => Promise<Outcome>): Promise<Keyed> => {
      const id = `${device} ${key}`
      const inFlight = running.get(id)
      if (inFlight) {
        return inFlight.method === method
          ? { outcome: await inFlight.done, replayed: true }
          : { outcome: fail("bad_request", "request key reused for another command"), replayed: false }
      }
      const row = stored(device, key)
      if (row) {
        const decoded = decodeOutcome(row.result)
        if (row.method !== method) {
          return { outcome: fail("bad_request", "request key reused for another command"), replayed: false }
        }
        if (Exit.isSuccess(decoded)) {
          return { outcome: decoded.value, replayed: true }
        }
      }
      const done = work()
      running.set(id, { method, done })
      try {
        const outcome = await done
        if (storable(outcome)) {
          save(device, key, method, outcome)
        }
        return { outcome, replayed: false }
      } finally {
        running.delete(id)
      }
    },
  }
}

export type Idempotency = ReturnType<typeof makeIdempotency>
