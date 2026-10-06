import type { FitAddon } from "@xterm/addon-fit"
import type { Terminal } from "@xterm/xterm"
import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"

export interface Pane {
  info: SessionView
  readonly term: Terminal | null
  readonly fit: FitAddon | null
  readonly pane: HTMLDivElement
  readonly isChat: boolean
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

export const workersOf = (masterId: SessionId) =>
  [...panes.values()].filter((p) => p.info.parentId === masterId).map((p) => p.info)

const fitTimers = new Map<SessionId, ReturnType<typeof setTimeout>>()

export const scheduleFit = (p: Pane) => {
  clearTimeout(fitTimers.get(p.info.id))
  fitTimers.set(
    p.info.id,
    setTimeout(() => {
      // Skips chat panes and hidden groups.
      if (!p.term || !p.fit || !p.pane.offsetParent) {
        return
      }
      try {
        p.fit.fit()
        api.resize(p.info.id, p.term.cols, p.term.rows)
      } catch {}
    }, 60),
  )
}

export const fitAll = () => panes.forEach(scheduleFit)
