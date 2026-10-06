// Capture phase, so terminals do not eat them.

import { closeActiveMaster, unzoom } from "./sessions.ts"
import { closeSettings, isSettingsOpen, toggleSettings } from "./settings-view.ts"
import { closeSheet, isSheetOpen, newSession, otherKind, submitSheet } from "./sheet.ts"
import { api } from "./api.ts"
import { saveSettings, settings } from "./store.ts"

export const toggleRail = () => saveSettings({ skillRailOpen: !settings().skillRailOpen })

const handled = (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

const onKey = (e: KeyboardEvent) => {
  const sheetOpen = isSheetOpen()
  const k = e.key.toLowerCase()
  if (e.metaKey && e.shiftKey && !e.altKey && k === "n") {
    handled(e)
    return newSession(undefined, otherKind())
  }
  if (e.metaKey && !e.shiftKey && !e.altKey) {
    if (k === "n") return handled(e), newSession()
    if (k === "/") return handled(e), toggleRail()
    if (k === ",") return handled(e), toggleSettings()
    if (/^[1-9]$/.test(k) && !sheetOpen) {
      const i = Number(k) - 1
      if (settings().locations[i]) {
        handled(e)
        newSession(i)
      }
      return
    }
    if (k === "enter" && sheetOpen) {
      e.preventDefault()
      return submitSheet()
    }
  }
  if (e.key === "Escape") {
    if (sheetOpen) closeSheet()
    else if (isSettingsOpen()) closeSettings()
    else unzoom()
  }
}

export const initShortcuts = () => {
  document.addEventListener("keydown", onKey, true)
  // Cmd+W comes from main so the window menu never sees it.
  api.onCloseShortcut(() => {
    if (isSheetOpen()) closeSheet()
    else if (isSettingsOpen()) closeSettings()
    else closeActiveMaster()
  })
}
