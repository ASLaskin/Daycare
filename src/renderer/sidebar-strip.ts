// Collapsed sidebar: one status dot per master.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { keyedRows, type Row } from "./keyed.ts"
import type { OpenView } from "./sidebar-items.ts"
import { paintDot, statusDot, wirePeek } from "./status-dot.ts"

const stripItem = (first: SessionView, onClick: (m: SessionView) => void) => {
  let m = first
  const item = el("button", "strip-item")
  item.type = "button"
  const dot = statusDot(m)
  item.append(dot)
  item.onclick = () => onClick(m)
  item.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(m.id)
  }
  wirePeek(item, () => m)
  const update = (next: SessionView) => {
    m = next
    paintDot(dot, m)
  }
  return { item, update }
}

const openDot = (first: OpenView): Row<OpenView> => {
  const { item, update } = stripItem(first.info, (m) => focusSession(m.id))
  return {
    node: item,
    update: ({ info, active }) => {
      update(info)
      item.classList.toggle("active", active)
    },
  }
}

const closedDot = (first: SessionView): Row<SessionView> => {
  const { item, update } = stripItem(first, (m) => api.reopenSession(m.id))
  item.classList.add("closed")
  return { node: item, update }
}

export const openDots = keyedRows((v: OpenView) => v.info.id, openDot)
export const closedDots = keyedRows((m: SessionView) => m.id, closedDot)
