// Collapsed sidebar: one status mark per master.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { keyedRows, type Row } from "./keyed.ts"
import type { OpenView } from "./sidebar-items.ts"
import { paintMark, statusMark, wirePeek } from "./status-mark.ts"

const stripItem = (first: SessionView, onClick: (m: SessionView) => void) => {
  let m = first
  const item = el("button", "strip-item")
  item.type = "button"
  const mark = statusMark(m)
  item.append(mark)
  item.onclick = () => onClick(m)
  item.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(m.id)
  }
  wirePeek(item, () => m)
  const update = (next: SessionView) => {
    m = next
    paintMark(mark, m)
  }
  return { item, update }
}

const openMark = (first: OpenView): Row<OpenView> => {
  const { item, update } = stripItem(first.info, (m) => focusSession(m.id))
  return {
    node: item,
    update: ({ info, active }) => {
      update(info)
      item.classList.toggle("active", active)
    },
  }
}

const closedMark = (first: SessionView): Row<SessionView> => {
  const { item, update } = stripItem(first, (m) => api.reopenSession(m.id))
  item.classList.add("closed")
  return { node: item, update }
}

export const openMarks = keyedRows((v: OpenView) => v.info.id, openMark)
export const closedMarks = keyedRows((m: SessionView) => m.id, closedMark)
