// Alert and Live Activity pushes from hub events; off without APNs settings.

import type { HubEvent, LiveSession } from "../../shared/coordinator.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import type { ActivityAttributes, ActivityState, ApnsToken } from "../../shared/mobile.ts"
import type { PowerState } from "../../shared/power.ts"
import type { Hub } from "../hub.ts"
import { activityState, type ActivityEvent, makeActivityPusher } from "./activity.ts"
import { type Alert, makeAlerts } from "./alerts.ts"
import { type ApnsRequest, deadToken, makeApns, type Transport } from "./apns.ts"
import type { ApnsSettings } from "./apnsConfig.ts"
import type { Device, Devices } from "./devices.ts"

export const ATTRIBUTES_TYPE = "DaycareActivityAttributes"

export interface PushDeps {
  readonly hub: Pick<Hub, "observe" | "state">
  readonly devices: Devices
  readonly transport: Transport
  readonly now?: () => number
}

const settingsKey = (s: ApnsSettings) => JSON.stringify([s.keyId, s.teamId, s.bundleId, s.environment, s.key.export({ format: "pem", type: "pkcs8" })])

// Live Activity aps body for one event
export const activityPayload = (event: ActivityEvent, state: ActivityState, nowMs: number, attributes: ActivityAttributes | null): Json => {
  const timestamp = Math.floor(nowMs / 1000)
  const base = { timestamp, event, "content-state": state }
  switch (event) {
    case "update":
      return { aps: base }
    case "end":
      return { aps: { ...base, "dismissal-date": timestamp } }
    case "start":
      return {
        aps: {
          ...base,
          "attributes-type": ATTRIBUTES_TYPE,
          attributes: attributes ?? { host: "" },
          alert: { title: "Agents running", body: `${state.runningCount} running on the Mac` },
        },
      }
  }
}

export const makePush = ({ hub, devices, transport, now = Date.now }: PushDeps) => {
  let apns: ReturnType<typeof makeApns> | null = null
  let key: string | null = null
  let host: string | null = null
  const initial = hub.state()
  const sessions = new Map<SessionId, LiveSession>(initial.sessions.map((s) => [s.id, s]))
  const approvals = new Set(initial.approvals.map((a) => `${a.session} ${a.request}`))
  let power: PowerState = initial.power
  // Epoch seconds each running turn started
  const since = new Map<SessionId, number>()

  const deliver = (req: ApnsRequest) => {
    if (!apns) {
      return
    }
    apns.send(req).then(
      (r) => {
        if (deadToken(r)) {
          devices.dropToken(req.token)
        }
        if (r.status !== 200) {
          console.error(`push: APNs ${r.status} ${r.reason ?? ""} for a ${req.type} push`)
        }
      },
      (e: Error) => console.error(`push: ${e.message}`),
    )
  }

  const alert = (a: Alert) =>
    devices
      .list()
      .filter((d) => d.kinds.includes(a.kind))
      .forEach((d) =>
        deliver({ token: d.apnsToken, environment: d.environment, type: "alert", payload: a.payload, priority: 10, ...(a.collapseId ? { collapseId: a.collapseId } : {}) }),
      )

  const live = (token: ApnsToken, device: Device | undefined, payload: Json, priority: 5 | 10) =>
    deliver({ token, environment: device?.environment ?? "development", type: "liveactivity", payload, priority })

  const pusher = makeActivityPusher((event, state, priority) => {
    const list = devices.list()
    const byDevice = new Map(list.map((d) => [d.device, d]))
    const tokens = devices.activities()
    const withActivity = new Set(tokens.map((t) => t.device))
    const body = (e: ActivityEvent) => activityPayload(e, state, now(), host ? { host } : null)
    tokens.forEach((t) => live(t.token, byDevice.get(t.device), body(event === "start" ? "update" : event), priority))
    if (event === "start" && host) {
      list.filter((d) => d.pushToStart && !withActivity.has(d.device)).forEach((d) => live(d.pushToStart!, d, body("start"), 10))
    }
    if (event === "end") {
      tokens.forEach((t) => devices.endActivity(t.activity))
    }
  })

  const alerts = makeAlerts((id) => sessions.get(id))

  const track = (s: LiveSession) => {
    const before = sessions.get(s.id)
    if (s.state === "running" && before?.state !== "running") {
      since.set(s.id, now() / 1000)
    }
    if (s.state !== "running") {
      since.delete(s.id)
    }
    sessions.set(s.id, s)
  }

  // True when the event can change the Live Activity
  const apply = (event: HubEvent): boolean => {
    switch (event.kind) {
      case "session":
        track(event.session)
        return true
      case "removed":
        sessions.delete(event.session)
        since.delete(event.session)
        return true
      case "approval":
        approvals.add(`${event.approval.session} ${event.approval.request}`)
        return true
      case "chat":
        return event.event.kind === "permission-resolved" && approvals.delete(`${event.session} ${event.event.requestId}`)
      case "power":
        power = event.power
        return true
      case "media":
      case "catalog":
        return false
    }
  }

  hub.observe((_, event) => {
    const changed = apply(event)
    if (!apns) {
      return
    }
    alerts(event).forEach(alert)
    if (!changed) {
      return
    }
    if (devices.activities().length) {
      pusher.activated()
    }
    pusher.update(activityState({ sessions: [...sessions.values()], approvals: approvals.size, power, since }, now()))
  })

  return {
    // Null turns push off; same settings keep the cached JWT
    configure: (settings: ApnsSettings | null) => {
      const next = settings ? settingsKey(settings) : null
      if (next === key) {
        return
      }
      key = next
      apns = settings ? makeApns(settings, transport, now) : null
      console.log(settings ? `push: APNs on for ${settings.bundleId}` : "push: off")
    },

    setHost: (h: string) => {
      host = h
    },

    enabled: () => apns !== null,

    stop: () => pusher.stop(),
  }
}

export type Push = ReturnType<typeof makePush>
