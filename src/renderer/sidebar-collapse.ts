// Sidebar collapsed to a strip of status marks.

import { $ } from "./dom.ts"
import { withShortcut } from "./keymap.ts"
import { onSettingsChanged, saveSettings, settings } from "./store.ts"

export const toggleSidebar = () => saveSettings({ sidebarCollapsed: !settings().sidebarCollapsed })

const applyCollapsed = () => {
  const collapsed = settings().sidebarCollapsed
  document.body.classList.toggle("sidebar-collapsed", collapsed)
  const button = $("#toggle-sidebar")
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar"
  button.title = withShortcut(label, "toggleSidebar")
  button.setAttribute("aria-label", label)
  button.setAttribute("aria-expanded", String(!collapsed))
}

export const initSidebarCollapse = () => {
  applyCollapsed()
  onSettingsChanged(applyCollapsed)
  $("#toggle-sidebar").onclick = toggleSidebar
  // Animate width only after the first paint.
  requestAnimationFrame(() => document.body.classList.add("sidebar-ready"))
}
