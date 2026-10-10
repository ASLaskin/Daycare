// Settings general panel.

import type { Settings } from "../shared/settings.ts"
import { $ } from "./dom.ts"
import { input, onSelect, onToggle, select } from "./fields.ts"
import { renderLocationRows, wireLocations } from "./locations-view.ts"
import { locationOptions, setCurrentLocation } from "./new-session.ts"
import { saveSettings, settings } from "./store.ts"

export const renderGeneral = () => {
  const s = settings()
  input("set-ask").checked = s.askOnNew
  input("set-random-names").checked = s.randomNames
  select("set-keep-awake").value = s.keepAwake
  input("set-keep-awake-lid").checked = s.keepAwakeLidClosed
  $("#keep-awake-lid-row").classList.toggle("collapsed", s.keepAwake === "off")
  locationOptions(select("set-default-location"), s.defaultLocation)
  select("set-model").value = s.model
  select("set-permission").value = s.permissionMode
  input("set-ooga-booga").checked = s.oogaBooga
  renderLocationRows()
}

export const wireGeneral = () => {
  wireLocations()
  onToggle("set-ask", (askOnNew) => saveSettings({ askOnNew }))
  onToggle("set-random-names", (randomNames) => saveSettings({ randomNames }))
  onToggle("set-ooga-booga", (oogaBooga) => saveSettings({ oogaBooga }))
  onToggle("set-keep-awake-lid", (keepAwakeLidClosed) => saveSettings({ keepAwakeLidClosed }))
  onSelect("set-default-location", (v) => {
    setCurrentLocation(Number(v))
    return saveSettings({ defaultLocation: Number(v) })
  })
  onSelect("set-model", (model) => saveSettings({ model }))
  onSelect("set-permission", (v) => saveSettings({ permissionMode: v as Settings["permissionMode"] }))
  onSelect("set-keep-awake", (v) => saveSettings({ keepAwake: v as Settings["keepAwake"] }))
}
