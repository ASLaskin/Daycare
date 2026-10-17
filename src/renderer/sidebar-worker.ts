// Sidebar row or status mark for one worker under its master.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { type Row, syncChildren } from "./keyed.ts"
import { paintContext, paintName, paintStatus, renamable, showsContext } from "./sidebar-tags.ts"
import { paintMark, statusMark, wirePeek } from "./status-mark.ts"

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

export const workerMark = (first: SessionView): Row<SessionView> => {
  let w = first
  const mark = statusMark(w)
  const hit = el("span", "worker-mark")
  hit.append(mark)
  hit.onclick = (e) => {
    e.stopPropagation()
    focusSession(w.id)
  }
  wirePeek(hit, () => w)
  const update = (next: SessionView) => {
    w = next
    paintMark(mark, w)
  }
  return { node: hit, update }
}
