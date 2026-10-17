// Strip of status marks for a group's collapsed panes.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { collapseWorkers, expandAll, isCollapsed, membersOf } from "./collapse.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { type Row, keyedRows, syncChildren } from "./keyed.ts"
import { workersOf } from "./state.ts"
import { paintMark, statusMark, wirePeek } from "./status-mark.ts"

const markRow = (view: SessionView): Row<SessionView> => {
  let current = view
  const button = el("button", "tray-mark")
  button.type = "button"
  const mark = statusMark(view)
  button.append(mark)
  button.onclick = () => focusSession(current.id)
  wirePeek(button, () => current)
  return {
    node: button,
    update: (next) => {
      current = next
      paintMark(mark, next)
    },
  }
}

interface Tray {
  readonly marks: HTMLElement
  readonly collapseBtn: HTMLButtonElement
  readonly expandBtn: HTMLButtonElement
  readonly rows: (views: ReadonlyArray<SessionView>) => ReadonlyArray<HTMLElement>
}

const trays = new Map<SessionId, Tray>()

const trayAction = (label: string, title: string, action: () => void) => {
  const b = el("button", "ghost tray-action", label)
  b.type = "button"
  b.title = title
  b.onclick = action
  return b
}

export const buildTray = (masterId: SessionId) => {
  const tray: Tray = {
    marks: el("div", "tray-marks"),
    collapseBtn: trayAction("Collapse workers", "Collapse every worker so the master fills the stage", () => collapseWorkers(masterId)),
    expandBtn: trayAction("Expand all", "Show every pane in this group", () => expandAll(masterId)),
    rows: keyedRows((v: SessionView) => v.id, markRow),
  }
  trays.set(masterId, tray)
  const node = el("div", "group-tray")
  node.append(tray.marks, tray.collapseBtn, tray.expandBtn)
  return node
}

export const renderTray = (masterId: SessionId) => {
  const tray = trays.get(masterId)
  if (!tray) {
    return
  }
  const hidden = membersOf(masterId).filter((m) => isCollapsed(m.id))
  syncChildren(tray.marks, tray.rows(hidden))
  tray.collapseBtn.hidden = workersOf(masterId).every((w) => isCollapsed(w.id))
  tray.expandBtn.hidden = !hidden.length
}

export const dropTray = (masterId: SessionId) => trays.delete(masterId)
