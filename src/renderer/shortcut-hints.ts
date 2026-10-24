// Shortcut text in button titles and hints.

import { $ } from "./dom.ts"
import { shortcutText, withShortcut } from "./keymap.ts"

export const applyShortcutHints = () => {
  $("#new-master").title = withShortcut("New chat", "newSession")
  $("#open-settings").title = withShortcut("Settings", "toggleSettings")
  const at = shortcutText("newSessionAt")
  $("#locations-hint").textContent = at ? `Numbered in order. ${at} open a session in that location.` : "Numbered in order."
}
