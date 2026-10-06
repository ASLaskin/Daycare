// Renderer entry: load settings, then mount views.

import "@xterm/xterm/css/xterm.css"
import "./fonts.css"
import "./styles/index.css"
import "./skills/skills.css"
import "./chat/chat.css"
import { applyAppearance } from "./appearance.ts"
import { $ } from "./dom.ts"
import { relayoutAll } from "./layout.ts"
import { initSidebarResize } from "./sidebar-resize.ts"
import { initUsage } from "./usage-view.ts"
import { initSessions } from "./sessions.ts"
import { initSettingsView, renderSettings, renderTabs } from "./settings-view.ts"
import { clampLocation, initNewSession, renderKindButtons, renderLocationPickers, setCurrentLocation } from "./new-session.ts"
import { initSheet } from "./sheet.ts"
import { initShortcuts, toggleRail } from "./shortcuts.ts"
import * as skills from "./skills/index.ts"
import { loadSettings, onSettingsChanged } from "./store.ts"

const s = await loadSettings()
setCurrentLocation(Math.min(s.defaultLocation, s.locations.length - 1))
applyAppearance()
relayoutAll()
renderLocationPickers()
renderKindButtons()

onSettingsChanged(() => {
  clampLocation()
  applyAppearance()
  renderLocationPickers()
  renderKindButtons()
  renderSettings()
})

initUsage()
initSidebarResize()
initSettingsView()
initNewSession()
initSheet()
initShortcuts()
$("#toggle-rail").onclick = toggleRail
skills.mountManager($("#skills-panel"))
skills.mountRail($("#skill-rail"))
renderTabs()
await initSessions()
