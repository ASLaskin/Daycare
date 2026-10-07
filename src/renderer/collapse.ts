// Collapsed panes per group, kept in memory.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { renderTray } from "./collapse-tray.ts"
import { focusSession, isFocused } from "./focus.ts"
import { applyLayout } from "./layout.ts"
import { panes, workersOf } from "./state.ts"
import { releaseZoom } from "./zoom.ts"

const collapsed = new Set<SessionId>()

export const isCollapsed = (id: SessionId) => collapsed.has(id)

const masterOf = (info: SessionView) => (info.role === "master" ? info.id : info.parentId)

// Master first, then its workers.
export const membersOf = (masterId: SessionId): ReadonlyArray<SessionView> => {
  const master = panes.get(masterId)?.info
  return [...(master ? [master] : []), ...workersOf(masterId)]
}

// Never leaves a group with nothing shown.
const keepOneShown = (masterId: SessionId) => {
  const members = membersOf(masterId)
  if (members.some((m) => !collapsed.has(m.id))) {
    return
  }
  collapsed.delete(masterId)
}

// Moves focus off a pane that just collapsed.
const refocus = (masterId: SessionId) => {
  const members = membersOf(masterId)
  if (!members.some((m) => collapsed.has(m.id) && isFocused(m.id))) {
    return
  }
  const next = members.find((m) => !collapsed.has(m.id))
  if (next) {
    focusSession(next.id)
  }
}

export const syncGroup = (masterId: SessionId) => {
  const g = document.getElementById(`group-${masterId}`)
  if (!g) {
    return
  }
  keepOneShown(masterId)
  membersOf(masterId).forEach((m) => panes.get(m.id)?.pane.classList.toggle("collapsed", collapsed.has(m.id)))
  applyLayout(g)
  renderTray(masterId)
  refocus(masterId)
}

export const collapse = (id: SessionId) => {
  const p = panes.get(id)
  const masterId = p ? masterOf(p.info) : null
  if (!p || !masterId) {
    return
  }
  const workers = workersOf(masterId)
  if (p.info.role === "master" && !workers.length) {
    return
  }
  // Hiding the master shows its workers.
  if (p.info.role === "master" && workers.every((w) => collapsed.has(w.id))) {
    workers.forEach((w) => collapsed.delete(w.id))
  }
  releaseZoom(p)
  collapsed.add(id)
  syncGroup(masterId)
}

export const expand = (id: SessionId) => {
  const p = panes.get(id)
  const masterId = p ? masterOf(p.info) : null
  if (!collapsed.delete(id) || !masterId) {
    return
  }
  syncGroup(masterId)
}

export const collapseWorkers = (masterId: SessionId) => {
  workersOf(masterId).forEach((w) => collapsed.add(w.id))
  collapsed.delete(masterId)
  syncGroup(masterId)
}

export const expandAll = (masterId: SessionId) => {
  membersOf(masterId).forEach((m) => collapsed.delete(m.id))
  syncGroup(masterId)
}

// Repaints the tray dot of a collapsed session.
export const repaintCollapsed = (info: SessionView) => {
  const masterId = masterOf(info)
  if (collapsed.has(info.id) && masterId) {
    renderTray(masterId)
  }
}

export const forgetCollapsed = (id: SessionId) => collapsed.delete(id)
