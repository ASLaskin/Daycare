// Focused session and active master.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import * as chat from "./chat/index.ts"
import { expand } from "./collapse.ts"
import { $ } from "./dom.ts"
import { renderProjectActions } from "./project-actions.ts"
import { isRenaming } from "./rename.ts"
import { dismissMaster } from "./session-actions.ts"
import { closeSettings } from "./settings-view.ts"
import { renderSidebar } from "./sidebar.ts"
import { panes } from "./state.ts"
import { fireFocusChanged } from "./store.ts"

let activeMaster: SessionId | null = null
let focusedId: SessionId | null = null

export const getActiveMaster = () => activeMaster

export const isFocused = (id: SessionId) => focusedId === id

export const focused = (): SessionView | null => (focusedId ? (panes.get(focusedId)?.info ?? null) : null)

// Types text into the focused session without submitting.
export const insertIntoFocused = (text: string): boolean => {
  const p = focusedId ? panes.get(focusedId) : undefined
  if (!p) {
    return false
  }
  return chat.insert(p.info.id, text) !== false
}

export const setFocused = (id: SessionId) => {
  if (focusedId === id) {
    return
  }
  if (focusedId) {
    panes.get(focusedId)?.pane.classList.remove("focused")
  }
  focusedId = id
  panes.get(id)?.pane.classList.add("focused")
  fireFocusChanged()
}

export const clearFocus = (id: SessionId) => {
  if (focusedId !== id) {
    return
  }
  focusedId = null
  fireFocusChanged()
}

export const showMaster = (id: SessionId | null) => {
  if (!id) {
    return
  }
  activeMaster = id
  document.querySelectorAll(".group").forEach((g) => g.classList.toggle("hidden", g.id !== `group-${id}`))
  $("#empty").style.display = "none"
  renderProjectActions()
  renderSidebar()
}

export const focusSession = (id: SessionId) => {
  const p = panes.get(id)
  if (!p) {
    return
  }
  closeSettings()
  expand(id)
  showMaster(p.info.role === "master" ? p.info.id : p.info.parentId)
  requestAnimationFrame(() => {
    if (!isRenaming()) {
      chat.focus(id)
    }
    setFocused(id)
  })
}

// Shows the next master, or the empty state.
export const releaseMaster = (id: SessionId) => {
  if (activeMaster !== id) {
    return
  }
  activeMaster = null
  const next = [...panes.values()].find((p) => p.info.role === "master")
  if (next) {
    showMaster(next.info.id)
    return
  }
  $("#empty").style.display = ""
}

export const closeActiveMaster = () => {
  if (activeMaster) {
    dismissMaster(activeMaster)
  }
}
