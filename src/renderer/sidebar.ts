// Sidebar list of masters and their workers.

import type { SessionView } from "../shared/session.ts"
import { $, el } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { isRenaming } from "./rename.ts"
import { closedItem, openItem } from "./sidebar-items.ts"
import { closedInfo, panes } from "./state.ts"

const newestFirst = (a: SessionView, b: SessionView) => b.createdAt - a.createdAt

export const renderSidebar = () => {
  if (isRenaming()) {
    return
  }
  const active = getActiveMaster()
  const open = [...panes.values()].map((p) => p.info).filter((i) => i.role === "master").sort(newestFirst)
  const closed = [...closedInfo.values()].filter((i) => i.role === "master").sort(newestFirst)
  $("#master-list").replaceChildren(
    ...open.map((m) => openItem(m, active)),
    ...(closed.length ? [el("div", "list-heading", "Closed")] : []),
    ...closed.map(closedItem),
  )
}
