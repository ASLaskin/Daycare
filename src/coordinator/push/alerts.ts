// Hub events as alert pushes: turns done, approvals, low battery.

import type { HubEvent, LiveSession } from "../../shared/coordinator.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import type { PushData, PushKind } from "../../shared/mobile.ts"
import type { Battery } from "../../shared/power.ts"

export const BATTERY_THRESHOLDS = [20, 10] as const
const BODY_MAX = 180

export interface Alert {
  readonly kind: PushKind
  readonly payload: Json
  readonly collapseId?: string
}

interface AlertText {
  readonly title: string
  readonly body: string
  readonly thread: string
  readonly data: PushData
}

const clip = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > BODY_MAX ? `${line.slice(0, BODY_MAX - 1)}…` : line
}

// Tapping opens the app; no category, so no action buttons
export const alertPayload = (a: AlertText): Json => ({
  aps: { alert: { title: a.title, body: a.body }, sound: "default", "thread-id": a.thread },
  daycare: { kind: a.data.kind, session: a.data.session, request: a.data.request },
})

// Master's id groups a family's alerts
const threadOf = (s: LiveSession) => s.parentId ?? s.id

const unplugged = (b: Battery) => !b.pluggedIn && !b.charging

export const makeAlerts = (session: (id: SessionId) => LiveSession | undefined) => {
  // Thresholds already alerted since the last charge
  const fired = new Set<number>()

  const battery = (b: Battery | null): ReadonlyArray<Alert> => {
    if (!b || !unplugged(b)) {
      fired.clear()
      return []
    }
    const crossed = BATTERY_THRESHOLDS.filter((t) => b.percent <= t && !fired.has(t))
    crossed.forEach((t) => fired.add(t))
    if (!crossed.length) {
      return []
    }
    const text = { title: `Mac battery at ${b.percent}%`, body: "Plug in the Mac to keep agents running.", thread: "battery" }
    return [{ kind: "battery-low", payload: alertPayload({ ...text, data: { kind: "battery-low", session: null, request: null } }), collapseId: "battery" }]
  }

  return (event: HubEvent): ReadonlyArray<Alert> => {
    switch (event.kind) {
      case "approval": {
        const s = session(event.approval.session)
        if (!s) {
          return []
        }
        const e = event.approval.event
        const body = e.kind === "permission" ? clip(e.title || `Allow ${e.name}?`) : "Approval needed"
        const data: PushData = { kind: "approval", session: s.id, request: event.approval.request }
        return [{ kind: "approval", payload: alertPayload({ title: `${s.name} needs you`, body, thread: threadOf(s), data }), collapseId: event.approval.request }]
      }
      case "chat": {
        const e = event.event
        const s = session(event.session)
        if (e.kind !== "turn-end" || !s) {
          return []
        }
        const kind: PushKind = s.role === "master" ? "master-done" : "worker-done"
        const title = e.isError ? `${s.name} failed` : `${s.name} finished`
        const body = clip(e.text) || (e.isError ? "failed" : "Done")
        return [{ kind, payload: alertPayload({ title, body, thread: threadOf(s), data: { kind, session: s.id, request: null } }) }]
      }
      case "power":
        return battery(event.power.battery)
      case "session":
      case "removed":
      case "media":
      case "catalog":
        return []
    }
  }
}
