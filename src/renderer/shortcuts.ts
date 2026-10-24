// App keyboard shortcuts, captured before inputs see them.

import { matchCombo } from "../shared/shortcuts/bindings.ts"
import type { ShortcutId } from "../shared/shortcuts/registry.ts"
import { cycleAgent, cycleSession, focusAgent } from "./agent-nav.ts"
import { api } from "./api.ts"
import { closeActiveMaster } from "./focus.ts"
import { bindings, IS_MAC, keyCapture, pressOf } from "./keymap.ts"
import { newSession } from "./new-session.ts"
import { closeSettings, isSettingsOpen, toggleSettings } from "./settings-view.ts"
import { toggleSidebar } from "./sidebar-collapse.ts"
import { closeSheet, isSheetOpen, submitSheet } from "./sheet.ts"
import { toggleRailTab } from "./side-rail/rail.ts"
import { saveSettings, settings } from "./store.ts"
import { toggleZoomFocused, unzoom } from "./zoom.ts"

const toggleRail = () => saveSettings({ railOpen: !settings().railOpen })

const handled = (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
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

// Digit is 1 to 9 for number shortcuts
const ACTIONS: Record<ShortcutId, (digit: number) => void> = {
  newSession: () => newSession(),
  newSessionAt: (digit) => newSession(digit - 1),
  closeSession: () => dismiss(closeActiveMaster),
  nextSession: () => cycleSession(1),
  prevSession: () => cycleSession(-1),
  jumpAgent: focusAgent,
  nextAgent: () => cycleAgent(1),
  prevAgent: () => cycleAgent(-1),
  zoomPane: toggleZoomFocused,
  fullScreen: () => void api.toggleFullScreen(),
  toggleAttachments: () => toggleRailTab("attachments"),
  toggleRail,
  toggleSidebar,
  toggleSettings,
}

// Held keys keep stepping through these
const REPEATS = new Set<ShortcutId>(["nextSession", "prevSession", "nextAgent", "prevAgent"])

// The new session sheet only takes submit and Esc
const onSheetKey = (e: KeyboardEvent) => {
  if (e.key === "Enter" && (IS_MAC ? e.metaKey : e.ctrlKey)) {
    e.preventDefault()
    submitSheet()
  }
}

const onKey = (e: KeyboardEvent) => {
  if (keyCapture.handler) {
    keyCapture.handler(e)
    return
  }
  if (e.key === "Escape") {
    dismiss(unzoom)
    return
  }
  if (isSheetOpen()) {
    onSheetKey(e)
    return
  }
  const combo = pressOf(e)
  const hit = combo ? matchCombo(bindings(), combo, IS_MAC) : null
  if (!hit) {
    return
  }
  handled(e)
  if (e.repeat && !REPEATS.has(hit.id)) {
    return
  }
  ACTIONS[hit.id](hit.digit ?? 1)
}

export const initShortcuts = () => {
  document.addEventListener("keydown", onKey, true)
  // Close shortcut from main dismisses or closes the master.
  api.onCloseShortcut(() => dismiss(closeActiveMaster))
}
