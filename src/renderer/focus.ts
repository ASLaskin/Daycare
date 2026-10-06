// Focused session and active master.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import * as chat from "./chat/index.ts"
import { $ } from "./dom.ts"
import { renderProjectActions } from "./project-actions.ts"
import { isRenaming } from "./rename.ts"
import { closeSettings } from "./settings-view.ts"
import { renderSidebar } from "./sidebar.ts"
import { type Pane, panes, scheduleFit } from "./state.ts"
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
  if (p.isChat) {
    return chat.insert(p.info.id, text) !== false
  }
  api.write(p.info.id, text)
  p.term?.focus()
  return true
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
  ;[...panes.values()].filter((p) => p.info.id === id || p.info.parentId === id).forEach(scheduleFit)
  renderSidebar()
}

const focusInput = (p: Pane) => {
  if (p.isChat) {
    chat.focus(p.info.id)
    return
  }
  p.term?.focus()
}

export const focusSession = (id: SessionId) => {
  const p = panes.get(id)
  if (!p) {
    return
  }
  closeSettings()
  showMaster(p.info.role === "master" ? p.info.id : p.info.parentId)
  requestAnimationFrame(() => {
    if (!isRenaming()) {
      focusInput(p)
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
    api.closeSession(activeMaster)
  }
}
