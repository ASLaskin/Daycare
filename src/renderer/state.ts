import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"

export interface Pane {
  info: SessionView
  readonly pane: HTMLDivElement
  readonly els: {
    readonly title: HTMLSpanElement
    readonly status: HTMLSpanElement
    readonly activity: HTMLSpanElement
    readonly ctx: HTMLSpanElement
  }
}

export const panes = new Map<SessionId, Pane>()
// Closed sessions, listed in the sidebar without panes.
export const closedInfo = new Map<SessionId, SessionView>()

// Restored session to focus once its pane opens.
export const pendingFocus = { id: null as SessionId | null }

export const workersOf = (masterId: SessionId) =>
  [...panes.values()].filter((p) => p.info.parentId === masterId).map((p) => p.info)
