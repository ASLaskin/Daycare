// Sidebar list of masters and their workers, patched in place.

import { groupOf, ungroupSession } from "../shared/groups.ts"
import type { GroupId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { sessionGroups, updateGroups } from "./groups.ts"
import { syncChildren } from "./keyed.ts"
import { isRenaming } from "./rename.ts"
import { archivedEntries } from "./sidebar-archived.ts"
import { dropZone } from "./sidebar-drag.ts"
import { groupRows, type GroupView } from "./sidebar-group.ts"
import { closedRows, type OpenView, openRows } from "./sidebar-items.ts"
import { paintSidebarMode, sidebarMode } from "./sidebar-mode.ts"
import { closedMarks, openMarks } from "./sidebar-strip.ts"
import { closedInfo, openMasters } from "./state.ts"
import { fireSessionsChanged } from "./store.ts"

const newestFirst = (a: SessionView, b: SessionView) => b.createdAt - a.createdAt

const closedHeading = el("div", "list-heading closed-heading")
const deleteAll = el("button", "ghost delete-all", "Delete all")
deleteAll.title = "Remove every closed session for good"
deleteAll.onclick = () => api.deleteClosedSessions()
closedHeading.append(el("span", null, "Closed"), deleteAll)
const closedDivider = el("div", "strip-divider")

// Open rows with grouped ones gathered where their newest member sits
const openEntries = (views: ReadonlyArray<OpenView>) => {
  const rows = openRows(views)
  const rowOf = new Map(views.map((v, i) => [v.info.id, rows[i]]))
  const groups = sessionGroups()
  const order = [...new Set(views.flatMap((v) => groupOf(groups, v.info.id)?.id ?? []))]
  const groupViews: ReadonlyArray<GroupView> = order.flatMap((id) => {
    const group = groups.find((g) => g.id === id)
    if (!group) {
      return []
    }
    const members = group.members.flatMap((m) => views.find((v) => v.info.id === m) ?? [])
    return [{ group, members, rows: members.flatMap((v) => rowOf.get(v.info.id) ?? []) }]
  })
  const groupNodes = new Map<GroupId, HTMLElement>(groupRows(groupViews).map((node, i) => [order[i] as GroupId, node]))
  const placed = new Set<GroupId>()
  return views.flatMap((v) => {
    const group = groupOf(groups, v.info.id)
    if (!group) {
      return rowOf.get(v.info.id) ?? []
    }
    if (placed.has(group.id)) {
      return []
    }
    placed.add(group.id)
    return groupNodes.get(group.id) ?? []
  })
}

export const renderSidebar = () => {
  if (isRenaming()) {
    return
  }
  const active = getActiveMaster()
  const open = openMasters()
  const closed = [...closedInfo.values()].filter((i) => i.role === "master").sort(newestFirst)
  const openViews = open.map((info) => ({ info, active: info.id === active }))
  const archived = [...closedInfo.values()].filter((i) => i.archived)
  paintSidebarMode(archived.length)
  syncChildren(
    $("#master-list"),
    sidebarMode.current === "archived"
      ? archivedEntries(archived)
      : [...openEntries(openViews), ...(closed.length ? [closedHeading] : []), ...closedRows(closed)],
  )
  syncChildren($("#master-strip"), [...openMarks(openViews), ...(closed.length ? [closedDivider] : []), ...closedMarks(closed)])
  fireSessionsChanged()
}

// Dropping a grouped session on empty list space ungroups it
export const initSidebarGroups = () =>
  dropZone(
    $("#master-list"),
    (id) => !!groupOf(sessionGroups(), id),
    (id) => updateGroups((groups) => ungroupSession(groups, id)),
  )
