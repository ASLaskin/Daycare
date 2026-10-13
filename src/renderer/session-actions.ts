// Close, restore, delete, and relocate actions for sessions.

import type { DirPath, SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
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

// Replaces a pristine master with one in another folder.
export const relocateMaster = async (id: SessionId, cwd: DirPath) => {
  const info = panes.get(id)?.info
  if (!info || !isPristine(info) || info.cwd === cwd) {
    return
  }
  await api.createMaster({ task: "", cwd, model: info.model, effort: info.effort, permissionMode: info.permissionMode, provider: info.provider })
  api.deleteSession(id)
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
