// Close, restore, delete, and relocate actions for sessions.

import type { DirPath, SessionId } from "../shared/ids.ts"
import type { NewMaster, SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { modeDefaults } from "./mode-defaults.ts"
import { closedInfo, panes, pendingFocus, workersOf } from "./state.ts"

// No message sent and no workers spawned.
export const isPristine = (info: SessionView) => !info.hadTurn && workersOf(info.id).length === 0

// Deletes a pristine master, closes any other.
export const dismissMaster = (id: SessionId) => {
  const info = panes.get(id)?.info
  if (info && isPristine(info)) {
    api.deleteSession(id)
    return
  }
  api.closeSession(id)
}

// Pristine master being replaced; its successor takes its place when created.
const swap = { from: null as SessionId | null }

// Old master the created one replaces, consumed once.
export const takeSwap = (info: SessionView): SessionId | null => {
  const from = swap.from
  if (!from || info.role !== "master" || info.status === "closed") {
    return null
  }
  swap.from = null
  return panes.has(from) ? from : null
}

// The old master is deleted once its successor is on screen, so no frame shows neither.
const replaceMaster = async (id: SessionId, options: NewMaster) => {
  if (swap.from) {
    return
  }
  swap.from = id
  try {
    await api.createMaster(options)
  } catch (e) {
    swap.from = null
    throw e
  }
}

// Replaces a pristine master with one in another folder.
export const relocateMaster = async (id: SessionId, cwd: DirPath) => {
  const info = panes.get(id)?.info
  if (!info || !isPristine(info) || info.cwd === cwd) {
    return
  }
  await replaceMaster(id, { task: "", cwd, model: info.model, effort: info.effort, permissionMode: info.permissionMode, masterMode: info.masterMode, provider: info.provider })
}

// Replaces a pristine master with one in the other mode, using that mode's defaults.
export const switchMasterMode = async (id: SessionId, masterMode: boolean) => {
  const info = panes.get(id)?.info
  if (!info || !isPristine(info) || info.masterMode === masterMode) {
    return
  }
  await replaceMaster(id, { task: "", cwd: info.cwd, ...modeDefaults(masterMode), permissionMode: info.permissionMode, masterMode, provider: info.provider })
}

const actionButton = (label: string, cls: string, title: string, action: () => void) => {
  const b = el("button", cls, label)
  b.title = title
  b.onclick = (e) => {
    e.stopPropagation()
    action()
  }
  return b
}

export const masterActions = (id: SessionId) => [
  actionButton("Close", "ghost", "Close this master and its workers, keeping them to reopen later (⌘W)", () => api.closeSession(id)),
  actionButton("Delete", "ghost danger", "End this master and its workers and remove them", () => api.deleteSession(id)),
]

// Restores an archived worker, reopening its closed master, then focuses it.
export const restoreWorker = async (w: SessionView) => {
  pendingFocus.id = w.id
  await api.unarchiveSession(w.id)
  if (w.parentId && closedInfo.get(w.parentId)?.role === "master") {
    await api.reopenSession(w.parentId)
  }
}
