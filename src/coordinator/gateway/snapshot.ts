// Slim phone snapshot and hub events as phone events.

import { phoneCatalog } from "../../shared/catalog.ts"
import type { HubEvent, LiveSession } from "../../shared/coordinator.ts"
import type { MobileEvent, MobileSession, MobileSnapshot } from "../../shared/mobile.ts"
import type { Hub } from "../hub.ts"

type SummaryHub = Pick<Hub, "summary">

const EMPTY = { lastEntry: null, lastEventAt: null, preview: null }

export const mobileSession = (hub: SummaryHub, s: LiveSession): MobileSession => ({ ...s, ...(hub.summary(s.id) ?? EMPTY) })

export const snapshot = (hub: Pick<Hub, "summary" | "state">): MobileSnapshot => {
  const state = hub.state()
  return {
    type: "snapshot",
    epoch: state.epoch,
    seq: state.seq,
    sessions: state.sessions.map((s) => mobileSession(hub, s)),
    approvals: [...state.approvals],
    power: state.power,
    catalog: state.catalog ? phoneCatalog(state.catalog) : null,
    unavailable: [...state.unavailable],
  }
}

// One hub event as what phones receive; resolutions also clear approvals
export const mobileEvents = (hub: SummaryHub, event: HubEvent): ReadonlyArray<MobileEvent> => {
  switch (event.kind) {
    case "session":
      return [{ kind: "session", session: mobileSession(hub, event.session) }]
    case "chat": {
      const chat: MobileEvent = { kind: "chat", session: event.session, entry: event.entry, event: event.event }
      if (event.event.kind !== "permission-resolved") {
        return [chat]
      }
      const resolved: MobileEvent = {
        kind: "approval-resolved",
        session: event.session,
        request: event.event.requestId,
        allowed: event.event.allowed,
        cancelled: event.event.reason === "cancelled",
      }
      return [chat, resolved]
    }
    case "catalog":
      return [{ kind: "catalog", catalog: phoneCatalog(event.catalog) }]
    case "approval":
    case "removed":
    case "power":
    case "media":
      return [event]
  }
}
