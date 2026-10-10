// Session events from main and the initial restore.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import * as chat from "./chat/index.ts"
import { focusSession, isFocused, showMaster } from "./focus.ts"
import { applyStatus, createPane } from "./pane.ts"
import { initProjectActions } from "./project-actions.ts"
import { playDing } from "./ding.ts"
import { removeSessionUI } from "./removal.ts"
import { beginRename } from "./rename.ts"
import { renderSidebar } from "./sidebar.ts"
import { closedInfo, panes } from "./state.ts"
import { shouldDing } from "../shared/ding.ts"
import { fireFocusChanged, settings } from "./store.ts"

const addSession = (info: SessionView) => {
  if (info.status === "closed") {
    closedInfo.set(info.id, info)
    return false
  }
  closedInfo.delete(info.id)
  if (panes.has(info.id)) {
    return false
  }
  createPane(info)
  return true
}

const renameFromMenu = ({ id }: { readonly id: SessionId; }) => {
  const nameEl = document.querySelector<HTMLElement>(`.master-item[data-id="${id}"] .name, .worker-item[data-id="${id}"] .wname`)
  const info = panes.get(id)?.info ?? closedInfo.get(id)
  if (nameEl && info) {
    beginRename(nameEl, id, info.name)
  }
}

const onRemoved = (info: { readonly id: SessionId; readonly parentId: SessionId | null }) => {
  closedInfo.delete(info.id)
  ;[...closedInfo.values()].filter((c) => c.parentId === info.id).forEach((c) => closedInfo.delete(c.id))
  removeSessionUI(info)
}

const onCreated = (info: SessionView) => {
  if (addSession(info) && info.role === "master") {
    focusSession(info.id)
  }
  renderSidebar()
}

const onClosed = (info: SessionView) => {
  closedInfo.set(info.id, info)
  if (panes.has(info.id)) {
    removeSessionUI(info)
    return
  }
  renderSidebar()
}

const onUpdate = (info: SessionView) => {
  if (info.status === "closed") {
    onClosed(info)
    return
  }
  const p = panes.get(info.id)
  if (!p) {
    return
  }
  // Focused session renamed or moved folders.
  const retarget = isFocused(info.id) && (p.info.cwd !== info.cwd || p.info.name !== info.name)
  const ding = shouldDing(p.info.status, info.status) && settings().doneSounds
  p.info = info
  applyStatus(p)
  if (ding) {
    playDing(info.role === "master" ? "master" : "worker")
  }
  renderSidebar()
  if (retarget) {
    fireFocusChanged()
  }
}

// Restores open sessions, masters first.
const restore = async () => {
  const list = [...(await api.listSessions())]
  list.sort((a, b) => (a.role === "master" ? -1 : 1) - (b.role === "master" ? -1 : 1))
  list.forEach(addSession)
  const first = list.find((i) => i.role === "master" && i.status !== "closed")
  if (first) {
    showMaster(first.id)
  }
  renderSidebar()
}

export const initSessions = async () => {
  initProjectActions()
  api.onRemoved(onRemoved)
  api.onCreated(onCreated)
  api.onUpdate(onUpdate)
  api.onBeginRename(renameFromMenu)
  api.onChatEvent(({ id, event }) => chat.event(id, event))
  api.onChatReset(({ id, events }) => chat.reset(id, events))
  await restore()
}
