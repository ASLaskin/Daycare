// Close, restore, delete, and relocate actions for sessions.

import type { DirPath, SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { carryDraft } from "./chat/index.ts"
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

// Replaces a pristine master with one in another folder.
export const relocateMaster = async (id: SessionId, cwd: DirPath) => {
  const info = panes.get(id)?.info
  if (!info || !isPristine(info) || info.cwd === cwd) {
    return
  }
  const next = await api.createMaster({ task: "", cwd, model: info.model, effort: info.effort, permissionMode: info.permissionMode, masterMode: info.masterMode, provider: info.provider })
  carryDraft(id, next.id)
  api.deleteSession(id)
}

// Replaces a pristine master with one in the other mode, using that mode's defaults.
export const switchMasterMode = async (id: SessionId, masterMode: boolean) => {
  const info = panes.get(id)?.info
  if (!info || !isPristine(info) || info.masterMode === masterMode) {
    return
  }
  const next = await api.createMaster({ task: "", cwd: info.cwd, ...modeDefaults(masterMode), permissionMode: info.permissionMode, masterMode, provider: info.provider })
  carryDraft(id, next.id)
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
