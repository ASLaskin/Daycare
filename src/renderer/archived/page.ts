import type { SessionView } from "../../shared/session.ts"
import { api } from "../api.ts"
import { el, setText } from "../dom.ts"
import { getActiveMaster } from "../focus.ts"
import { keyedRows, type Row, syncChildren } from "../keyed.ts"
import { restoreWorker } from "../session-actions.ts"
import { closedInfo, panes } from "../state.ts"
import { onFocusChanged, onSessionsChanged } from "../store.ts"

interface ArchivedPageEls {
  readonly session: HTMLElement
  readonly list: HTMLElement
}

let els: ArchivedPageEls | null = null

// Active master's archived workers, newest first
const archivedWorkers = (master: SessionView) =>
  [...closedInfo.values()].filter((w) => w.archived && w.parentId === master.id).sort((a, b) => b.createdAt - a.createdAt)

const rowButton = (label: string, cls: string, title: string, action: () => void) => {
  const b = el("button", cls, label)
  b.type = "button"
  b.title = title
  b.onclick = action
  return b
}

const archivedRow = (first: SessionView): Row<SessionView> => {
  let w = first
  const row = el("div", "arc-row")
  const name = el("span", "arc-name")
  const actions = el("div", "arc-actions")
  actions.append(
    rowButton("Restore", "arc-btn", "Reopen this worker with its history", () => void restoreWorker(w)),
    rowButton("Delete", "arc-btn danger", "Remove this worker for good", () => api.deleteSession(w.id)),
  )
  row.append(name, actions)
  const update = (next: SessionView) => {
    w = next
    setText(name, w.name)
    name.title = w.name
  }
  return { node: row, update }
}

const rows = keyedRows((w: SessionView) => w.id, archivedRow)

const render = () => {
  if (!els) {
    return
  }
  const id = getActiveMaster()
  const master = id ? panes.get(id)?.info : undefined
  els.session.classList.toggle("quiet", !master)
  if (!master) {
    els.session.replaceChildren(el("span", "sr-session-name", "Open a chat"))
    syncChildren(els.list, [el("div", "sr-empty", "Open a chat to see its archived workers.")])
    return
  }
  els.session.replaceChildren(el("span", "sr-session-label", "Archived from this chat"), el("span", "sr-session-name", master.name || "Session"))
  const workers = archivedWorkers(master)
  syncChildren(els.list, workers.length ? rows(workers) : [el("div", "sr-empty", "Workers you or this chat archive show up here.")])
}

// Archived workers of the active master, to restore or delete
export const mountArchivedPage = (host: HTMLElement) => {
  const head = el("div", "sr-head")
  const session = el("div", "sr-session")
  head.append(session)
  const list = el("div", "arc-list")
  host.append(head, list)
  els = { session, list }
  render()
}

onSessionsChanged(render)
onFocusChanged(render)
