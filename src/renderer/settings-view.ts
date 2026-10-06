// Settings screen: tabs and panels.

import { $, el } from "./dom.ts"
import { initPowerView } from "./power-view.ts"
import { renderAppearance, wireAppearance } from "./settings-appearance.ts"
import { renderGeneral, wireGeneral } from "./settings-general.ts"
import { renderLayoutPanel, wireLayoutPanel } from "./settings-layout.ts"
import * as skills from "./skills/index.ts"
import { initUpdateView } from "./update-view.ts"

const PANELS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "skills", label: "Skills" },
] as const
type Panel = (typeof PANELS)[number]["id"]
let activePanel: Panel = "general"

const view = () => $("#settings")

export const isSettingsOpen = () => !view().classList.contains("hidden")

export const closeSettings = () => view().classList.add("hidden")

export const renderSettings = () => {
  renderGeneral()
  renderAppearance()
  renderLayoutPanel()
}

export const renderTabs = () => {
  $("#settings-tabs").replaceChildren(
    ...PANELS.map((p) => {
      const b = el("button", p.id === activePanel ? "active" : null, p.label)
      b.onclick = () => showPanel(p.id)
      return b
    }),
  )
}

const showPanel = (id: Panel) => {
  activePanel = id
  PANELS.forEach((p) => $(`#panel-${p.id}`).classList.toggle("hidden", p.id !== id))
  renderTabs()
  if (id === "skills") {
    skills.refresh()
  }
}

const openSettings = () => {
  renderSettings()
  renderTabs()
  view().classList.remove("hidden")
}

export const toggleSettings = () => (isSettingsOpen() ? closeSettings() : openSettings())

export const initSettingsView = () => {
  wireGeneral()
  wireAppearance()
  wireLayoutPanel()
  $("#open-settings").onclick = toggleSettings
  $("#close-settings").onclick = closeSettings
  initUpdateView()
  initPowerView()
  renderTabs()
}
