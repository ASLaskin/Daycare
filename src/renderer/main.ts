// Renderer entry: load settings, then mount views.

import "./fonts.css"
import "./styles/index.css"
import "./skills/skills.css"
import "./chat/chat.css"
import { initAccountPicker } from "./account-picker.ts"
import "./attachments/attachments.css"
import "./side-rail/side-rail.css"
import { applyAppearance } from "./appearance.ts"
import { initCoordinatorView } from "./coordinator-view.ts"
import { $ } from "./dom.ts"
import { relayoutAll } from "./layout.ts"
import { initSidebarCollapse } from "./sidebar-collapse.ts"
import { initSidebarResize } from "./sidebar-resize.ts"
import { initUsage } from "./usage-view.ts"
import { initSessions } from "./sessions.ts"
import { initSettingsView, renderSettings, renderTabs } from "./settings-view.ts"
import { clampLocation, initNewSession, renderLocationPickers, setCurrentLocation } from "./new-session.ts"
import { initSheet } from "./sheet.ts"
import { initShortcuts } from "./shortcuts.ts"
import { mountSideRail } from "./side-rail/rail.ts"
import * as skills from "./skills/index.ts"
import { loadSettings, onSettingsChanged } from "./store.ts"

const s = await loadSettings()
setCurrentLocation(Math.min(s.defaultLocation, s.locations.length - 1))
applyAppearance()
relayoutAll()
renderLocationPickers()

onSettingsChanged(() => {
  clampLocation()
  applyAppearance()
  renderLocationPickers()
  renderSettings()
})

initUsage()
initAccountPicker()
initSidebarResize()
initSidebarCollapse()
initSettingsView()
initNewSession()
initSheet()
initShortcuts()
skills.mountManager($("#skills-panel"))
mountSideRail($("#side-rail"))
renderTabs()
initCoordinatorView()
await initSessions()
