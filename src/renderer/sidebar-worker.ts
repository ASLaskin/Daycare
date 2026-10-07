// Sidebar row or dot for one worker under its master.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { type Row, syncChildren } from "./keyed.ts"
import { paintContext, paintName, paintStatus, renamable, showsContext } from "./sidebar-tags.ts"
import { paintDot, statusDot, wirePeek } from "./status-dot.ts"

export const workerRow = (first: SessionView): Row<SessionView> => {
  let w = first
  const row = el("div", "worker-item")
  row.dataset["id"] = w.id
  const name = renamable("wname", () => w)
  const right = el("span", "wright")
  const ctx = el("span")
  const status = el("span")
  row.append(name, right)
  row.onclick = (e) => {
    e.stopPropagation()
    focusSession(w.id)
  }
  row.oncontextmenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    api.sessionMenu(w.id)
  }
  const update = (next: SessionView) => {
    w = next
    paintName(name, w.name)
    paintContext(ctx, w.context)
    paintStatus(status, w.status)
    syncChildren(right, showsContext(w.context) ? [ctx, status] : [status])
  }
  return { node: row, update }
}

export const workerDot = (first: SessionView): Row<SessionView> => {
  let w = first
  const dot = statusDot(w)
  const hit = el("span", "worker-dot")
  hit.append(dot)
  hit.onclick = (e) => {
    e.stopPropagation()
    focusSession(w.id)
  }
  wirePeek(hit, () => w)
  const update = (next: SessionView) => {
    w = next
    paintDot(dot, w)
  }
  return { node: hit, update }
}
