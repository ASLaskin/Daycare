// Sidebar list of masters and their workers, patched in place.

import type { SessionView } from "../shared/session.ts"
import { $, el } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { syncChildren } from "./keyed.ts"
import { isRenaming } from "./rename.ts"
import { closedRows, openRows } from "./sidebar-items.ts"
import { closedDots, openDots } from "./sidebar-strip.ts"
import { closedInfo, panes } from "./state.ts"

const newestFirst = (a: SessionView, b: SessionView) => b.createdAt - a.createdAt

const closedHeading = el("div", "list-heading", "Closed")
const closedDivider = el("div", "strip-divider")

export const renderSidebar = () => {
  if (isRenaming()) {
    return
  }
  const active = getActiveMaster()
  const open = [...panes.values()].map((p) => p.info).filter((i) => i.role === "master").sort(newestFirst)
  const closed = [...closedInfo.values()].filter((i) => i.role === "master").sort(newestFirst)
  const openViews = open.map((info) => ({ info, active: info.id === active }))
  syncChildren($("#master-list"), [...openRows(openViews), ...(closed.length ? [closedHeading] : []), ...closedRows(closed)])
  syncChildren($("#master-strip"), [...openDots(openViews), ...(closed.length ? [closedDivider] : []), ...closedDots(closed)])
}
