// Flashes agents that need the user and outlines a finished master.

import type { SessionId } from "../shared/ids.ts"
import { deriveActivity, highlightsFor } from "./agent-activity.ts"
import { getActiveMaster } from "./focus.ts"
import { openSessions, panes } from "./state.ts"
import { onFocusChanged, onSessionsChanged } from "./store.ts"

const ENTRIES = "#master-list [data-id], #master-strip [data-id]"

const mark = (entries: ReadonlyArray<HTMLElement>, cls: string, ids: ReadonlyArray<SessionId>) => {
  const wanted = new Set<string>(ids)
  entries.forEach((node) => node.classList.toggle(cls, wanted.has(node.dataset["id"] ?? "")))
}

const paint = () => {
  const active = getActiveMaster()
  const { attention, finished } = highlightsFor(deriveActivity(openSessions()), active ? (panes.get(active)?.info ?? null) : null)
  const entries = [...document.querySelectorAll<HTMLElement>(ENTRIES)]
  mark(entries, "needs-attention", attention)
  mark(entries, "all-done", finished)
}

export const initAgentHighlights = () => {
  onSessionsChanged(paint)
  onFocusChanged(paint)
}
