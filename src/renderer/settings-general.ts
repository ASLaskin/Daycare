// Settings general panel.

import type { Settings } from "../shared/settings.ts"
import { $ } from "./dom.ts"
import { input, onSelect, onToggle, select } from "./fields.ts"
import { renderLocationRows, wireLocations } from "./locations-view.ts"
import { fillModels, MASTER_CHOICES, renderModelGuide, WORKER_CHOICES } from "./model-options.ts"
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
  select("set-master-model").value = s.masterModel
  select("set-worker-model").value = s.workerModel
  select("set-worker-model").disabled = s.autoWorkerModel
  input("set-auto-worker-model").checked = s.autoWorkerModel
  $("#worker-model-field").classList.toggle("disabled", s.autoWorkerModel)
  select("set-permission").value = s.permissionMode
  renderLocationRows()
}

export const wireGeneral = () => {
  wireLocations()
  onToggle("set-ask", (askOnNew) => saveSettings({ askOnNew }))
  onToggle("set-random-names", (randomNames) => saveSettings({ randomNames }))
  onToggle("set-keep-awake-lid", (keepAwakeLidClosed) => saveSettings({ keepAwakeLidClosed }))
  onSelect("set-default-location", (v) => {
    setCurrentLocation(Number(v))
    return saveSettings({ defaultLocation: Number(v) })
  })
  fillModels(select("set-master-model"), MASTER_CHOICES)
  fillModels(select("set-worker-model"), WORKER_CHOICES)
  renderModelGuide($("#model-guide"))
  onSelect("set-master-model", (masterModel) => saveSettings({ masterModel }))
  onSelect("set-worker-model", (workerModel) => saveSettings({ workerModel }))
  onToggle("set-auto-worker-model", (autoWorkerModel) => saveSettings({ autoWorkerModel }))
  onSelect("set-permission", (v) => saveSettings({ permissionMode: v as Settings["permissionMode"] }))
  onSelect("set-keep-awake", (v) => saveSettings({ keepAwake: v as Settings["keepAwake"] }))
}
