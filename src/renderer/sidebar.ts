// Sidebar list of masters and their workers, patched in place.

import type { SessionView } from "../shared/session.ts"
import { $, el } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { syncChildren } from "./keyed.ts"
import { isRenaming } from "./rename.ts"
import { closedRows, openRows } from "./sidebar-items.ts"
import { closedInfo, panes } from "./state.ts"

const newestFirst = (a: SessionView, b: SessionView) => b.createdAt - a.createdAt

const closedHeading = el("div", "list-heading", "Closed")

export const renderSidebar = () => {
  if (isRenaming()) {
    return
  }
  const active = getActiveMaster()
  const open = [...panes.values()].map((p) => p.info).filter((i) => i.role === "master").sort(newestFirst)
  const closed = [...closedInfo.values()].filter((i) => i.role === "master").sort(newestFirst)
  syncChildren($("#master-list"), [
    ...openRows(open.map((info) => ({ info, active: info.id === active }))),
    ...(closed.length ? [closedHeading] : []),
    ...closedRows(closed),
  ])
}
