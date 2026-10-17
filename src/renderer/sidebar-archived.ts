// Sidebar list of archived workers under their masters.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el, setText } from "./dom.ts"
import { keyedRows, type Row } from "./keyed.ts"
import { restoreWorker } from "./session-actions.ts"
import { setSidebarMode } from "./sidebar-mode.ts"
import { closedInfo, panes } from "./state.ts"

const empty = el("div", "sidebar-empty", "No archived workers. Archive one from its pane menu.")

const headingRow = (first: SessionView): Row<SessionView> => {
  const node = el("div", "list-heading")
  const update = (m: SessionView) => setText(node, m.name || "Session")
  update(first)
  return { node, update }
}

const archivedRow = (first: SessionView): Row<SessionView> => {
  let w = first
  const row = el("div", "worker-item archived-item")
  row.title = "Click to restore with its history"
  const name = el("span", "wname")
  row.append(name)
  row.onclick = () => {
    setSidebarMode("active")
    void restoreWorker(w)
  }
  row.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(w.id)
  }
  const update = (next: SessionView) => {
    w = next
    setText(name, w.name)
  }
  return { node: row, update }
}

const headings = keyedRows((m: SessionView) => m.id, headingRow)
const rows = keyedRows((w: SessionView) => w.id, archivedRow)

const masterOf = (id: SessionId) => panes.get(id)?.info ?? closedInfo.get(id)

// Newest masters first, each heading its archived workers
export const archivedEntries = (archived: ReadonlyArray<SessionView>): ReadonlyArray<HTMLElement> => {
  const masters = [...new Set(archived.flatMap((w) => (w.parentId ? [w.parentId] : [])))]
    .flatMap((id) => masterOf(id) ?? [])
    .sort((a, b) => b.createdAt - a.createdAt)
  if (!masters.length) {
    return [empty]
  }
  const groups = masters.map((m) => ({ m, workers: archived.filter((w) => w.parentId === m.id).sort((a, b) => b.createdAt - a.createdAt) }))
  const heads = headings(groups.map((g) => g.m))
  const items = rows(groups.flatMap((g) => g.workers))
  const itemOf = new Map(groups.flatMap((g) => g.workers).map((w, i) => [w.id, items[i]] as const))
  return groups.flatMap((g, i) => [heads[i]!, ...g.workers.flatMap((w) => itemOf.get(w.id) ?? [])])
}
