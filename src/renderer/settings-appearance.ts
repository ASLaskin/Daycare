// Settings appearance panel.

import type { Settings } from "../shared/settings.ts"
import { FONTS, MONOS, MOTIONS } from "./appearance.ts"
import { $, el } from "./dom.ts"
import { choicePicker, input, onSelect, onToggle, segPicker, select } from "./fields.ts"
import { showContext } from "./context-meter.ts"
import { refreshContexts } from "./pane.ts"
import { renderSidebar } from "./sidebar.ts"
import { saveSettings, settings } from "./store.ts"

const renderPickers = () => {
  const root = document.documentElement.dataset
  segPicker($("#motion-picker"), MOTIONS, root["motion"] ?? "", (motion) => saveSettings({ motion }))
  choicePicker($("#font-picker"), FONTS, root["font"] ?? "", (font) => saveSettings({ font }), (b, it) => {
    b.dataset["font"] = it.id
    b.append(el("span", "font-sample", "The quick brown fox"))
  })
  choicePicker($("#mono-picker"), MONOS, root["mono"] ?? "", (monoFont) => saveSettings({ monoFont }), (b, it) => {
    b.dataset["mono"] = it.id
    b.append(el("span", "font-sample mono", "const x = { a: 0 };"))
  })
}

export const renderAppearance = () => {
  const s = settings()
  renderPickers()
  input("set-show-icons").checked = s.showIcons
  input("set-show-context").checked = showContext()
  $("#context-options").classList.toggle("collapsed", !showContext())
  select("set-context-limit").value = String(s.contextLimit)
  select("set-context-scale").value = String(s.contextScale)
  select("set-app-icon").value = s.appIcon
}

export const wireAppearance = () => {
  onToggle("set-show-icons", (showIcons) => saveSettings({ showIcons }).then(renderSidebar))
  onToggle("set-show-context", (showContext) => saveSettings({ showContext }).then(refreshContexts))
  onSelect("set-context-limit", (v) => saveSettings({ contextLimit: Number(v) }).then(refreshContexts))
  onSelect("set-context-scale", (v) => saveSettings({ contextScale: Number(v) }).then(refreshContexts))
  onSelect("set-app-icon", (v) => saveSettings({ appIcon: v as Settings["appIcon"] }))
}
