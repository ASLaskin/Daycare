// Live Activity content state, coalesced updates, start and idle end.

import type { LiveSession } from "../../shared/coordinator.ts"
import type { SessionId } from "../../shared/ids.ts"
import { type ActivityState, type ActivityWorker } from "../../shared/mobile.ts"
import type { PowerState } from "../../shared/power.ts"

export const MAX_RUNNING = 4
export const COALESCE_MS = 15_000
export const IDLE_END_MS = 10 * 60_000

export type ActivityEvent = "start" | "update" | "end"

export interface ActivityInput {
  readonly sessions: ReadonlyArray<LiveSession>
  readonly approvals: number
  readonly power: PowerState
  // Epoch seconds each running session's turn started
  readonly since: ReadonlyMap<SessionId, number>
}

// Mirrors ActivityStateBuilder in DaycareKit
export const activityState = (input: ActivityInput, nowMs: number): ActivityState => {
  const now = nowMs / 1000
  const names = new Map(input.sessions.map((s) => [s.id, s.name]))
  const running = input.sessions
    .filter((s) => s.state === "running" && !s.closed)
    .map((s): ActivityWorker => ({ id: s.id, name: s.name, master: s.parentId ? (names.get(s.parentId) ?? null) : null, since: input.since.get(s.id) ?? now }))
    .sort((a, b) => b.since - a.since)
  return {
    running: running.slice(0, MAX_RUNNING),
    runningCount: running.length,
    approvals: input.approvals,
    batteryPercent: input.power.battery?.percent ?? null,
    charging: input.power.battery?.charging ?? false,
    keepAwake: input.power.holding,
    updatedAt: now,
  }
}

const signature = ({ updatedAt: _, ...rest }: ActivityState) => JSON.stringify(rest)

export type ActivitySink = (event: ActivityEvent, state: ActivityState, priority: 5 | 10) => void

export interface Clock {
  readonly now: () => number
  readonly setTimeout: (f: () => void, ms: number) => ReturnType<typeof setTimeout>
  readonly clearTimeout: (t: ReturnType<typeof setTimeout>) => void
}

const realClock: Clock = { now: Date.now, setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) }

// At most one low priority update per 15 s; approval changes go at once
export const makeActivityPusher = (sink: ActivitySink, clock: Clock = realClock) => {
  let sent: ActivityState | null = null
  let sentAt = 0
  let pending: ActivityState | null = null
  let flush: ReturnType<typeof setTimeout> | null = null
  let idle: ReturnType<typeof setTimeout> | null = null
  // An activity is believed to be showing
  let active = false

  const cancel = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) {
      clock.clearTimeout(t)
    }
    return null
  }

  const emit = (event: ActivityEvent, state: ActivityState, priority: 5 | 10) => {
    flush = cancel(flush)
    pending = null
    sent = state
    sentAt = clock.now()
    sink(event, state, priority)
  }

  const end = () => {
    idle = null
    if (active && sent) {
      active = false
      emit("end", { ...sent, updatedAt: clock.now() / 1000 }, 10)
    }
  }

  return {
    update: (state: ActivityState) => {
      const busy = state.runningCount > 0 || state.approvals > 0
      idle = busy ? cancel(idle) : (idle ?? clock.setTimeout(end, IDLE_END_MS))
      if (!active) {
        if (state.runningCount > 0) {
          active = true
          emit("start", state, 10)
        }
        return
      }
      if (sent && signature(sent) === signature(state)) {
        return
      }
      if (!sent || sent.approvals !== state.approvals) {
        emit("update", state, 10)
        return
      }
      pending = state
      const wait = sentAt + COALESCE_MS - clock.now()
      if (wait <= 0) {
        emit("update", state, 5)
        return
      }
      flush ??= clock.setTimeout(() => {
        flush = null
        if (pending) {
          emit("update", pending, 5)
        }
      }, wait)
    },

    // The phone started one itself
    activated: () => {
      active = true
    },

    stop: () => {
      flush = cancel(flush)
      idle = cancel(idle)
    },
  }
}

export type ActivityPusher = ReturnType<typeof makeActivityPusher>
