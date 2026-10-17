// App keyboard shortcuts, captured before inputs see them.

import { api } from "./api.ts"
import { closeActiveMaster } from "./focus.ts"
import { newSession } from "./new-session.ts"
import { closeSettings, isSettingsOpen, toggleSettings } from "./settings-view.ts"
import { toggleSidebar } from "./sidebar-collapse.ts"
import { closeSheet, isSheetOpen, submitSheet } from "./sheet.ts"
import { saveSettings, settings } from "./store.ts"
import { unzoom } from "./zoom.ts"

const toggleRail = () => saveSettings({ railOpen: !settings().railOpen })

const handled = (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

const COMMAND_KEYS: Record<string, () => void> = {
  n: () => newSession(),
  "/": toggleRail,
  ",": toggleSettings,
  b: toggleSidebar,
}

// Closes the topmost of sheet, settings, or fallback.
const dismiss = (fallback: () => void) => {
  if (isSheetOpen()) {
    closeSheet()
    return
  }
  if (isSettingsOpen()) {
    closeSettings()
    return
  }
  fallback()
}

const onLocationKey = (e: KeyboardEvent, k: string) => {
  const i = Number(k) - 1
  if (settings().locations[i]) {
    handled(e)
    newSession(i)
  }
}

const onCommandKey = (e: KeyboardEvent, k: string) => {
  const command = COMMAND_KEYS[k]
  if (command) {
    handled(e)
    command()
    return
  }
  const sheetOpen = isSheetOpen()
  if (/^[1-9]$/.test(k) && !sheetOpen) {
    onLocationKey(e, k)
    return
  }
  if (k === "enter" && sheetOpen) {
    e.preventDefault()
    submitSheet()
  }
}

const onKey = (e: KeyboardEvent) => {
  const k = e.key.toLowerCase()
  if (e.metaKey && !e.shiftKey && !e.altKey) {
    onCommandKey(e, k)
    return
  }
  if (e.key === "Escape") {
    dismiss(unzoom)
  }
}

export const initShortcuts = () => {
  document.addEventListener("keydown", onKey, true)
  // Cmd+W from main dismisses or closes the master.
  api.onCloseShortcut(() => dismiss(closeActiveMaster))
}
