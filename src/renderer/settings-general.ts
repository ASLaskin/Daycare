// Settings general panel.

import type { KeepAwake, Settings } from "../shared/settings.ts"
import { api } from "./api.ts"
import { $ } from "./dom.ts"
import { previewDings } from "./ding.ts"
import { input, onSelect, onToggle, select } from "./fields.ts"
import { renderLocationRows, wireLocations } from "./locations-view.ts"
import { MASTER_EFFORT_CHOICES, renderEffortGuide, WORKER_EFFORT_CHOICES } from "./effort-options.ts"
import { fillModels, MASTER_CHOICES, renderModelGuide, WORKER_CHOICES } from "./model-options.ts"
import { locationOptions, setCurrentLocation } from "./new-session.ts"
import { saveSettings, settings } from "./store.ts"

export const renderGeneral = () => {
  const s = settings()
  input("set-ask").checked = s.askOnNew
  input("set-random-names").checked = s.randomNames
  input("set-done-sounds").checked = s.doneSounds
  input("set-keep-awake-lid").checked = s.keepAwakeLidClosed
  locationOptions(select("set-default-location"), s.defaultLocation)
  select("set-provider").value = s.provider
  select("set-chat-model").value = s.chatModel
  select("set-master-model").value = s.masterModel
  select("set-worker-model").value = s.workerModel
  select("set-worker-model").disabled = s.autoWorkerModel
  input("set-auto-worker-model").checked = s.autoWorkerModel
  $("#worker-model-field").classList.toggle("disabled", s.autoWorkerModel)
  select("set-chat-effort").value = s.chatEffort
  select("set-master-effort").value = s.masterEffort
  select("set-worker-effort").value = s.workerEffort
  select("set-worker-effort").disabled = s.autoWorkerEffort
  input("set-auto-worker-effort").checked = s.autoWorkerEffort
  $("#worker-effort-field").classList.toggle("disabled", s.autoWorkerEffort)
  select("set-permission").value = s.permissionMode
  input("set-confirm-subagents").checked = s.confirmSubagents
  input("set-code-mode").checked = s.codeMode
  renderLocationRows()
}

export const wireGeneral = () => {
  wireLocations()
  onToggle("set-ask", (askOnNew) => saveSettings({ askOnNew }))
  onToggle("set-random-names", (randomNames) => saveSettings({ randomNames }))
  onToggle("set-confirm-subagents", (confirmSubagents) => saveSettings({ confirmSubagents }))
  onToggle("set-code-mode", (codeMode) => saveSettings({ codeMode }))
  onToggle("set-done-sounds", (doneSounds) => {
    saveSettings({ doneSounds })
    if (doneSounds) {
      previewDings()
    }
  })
  onToggle("set-keep-awake-lid", (keepAwakeLidClosed) => saveSettings({ keepAwakeLidClosed }))
  onSelect("set-default-location", (v) => {
    setCurrentLocation(Number(v))
    return saveSettings({ defaultLocation: Number(v) })
  })
  onSelect("set-provider", (v) => saveSettings({ provider: v as Settings["provider"] }))
  fillModels(select("set-chat-model"), MASTER_CHOICES)
  fillModels(select("set-master-model"), MASTER_CHOICES)
  fillModels(select("set-worker-model"), WORKER_CHOICES)
  renderModelGuide($("#model-guide"))
  onSelect("set-chat-model", (chatModel) => saveSettings({ chatModel }))
  onSelect("set-master-model", (masterModel) => saveSettings({ masterModel }))
  onSelect("set-worker-model", (workerModel) => saveSettings({ workerModel }))
  onToggle("set-auto-worker-model", (autoWorkerModel) => saveSettings({ autoWorkerModel }))
  fillModels(select("set-chat-effort"), MASTER_EFFORT_CHOICES)
  fillModels(select("set-master-effort"), MASTER_EFFORT_CHOICES)
  fillModels(select("set-worker-effort"), WORKER_EFFORT_CHOICES)
  renderEffortGuide($("#effort-guide"))
  onSelect("set-chat-effort", (chatEffort) => saveSettings({ chatEffort }))
  onSelect("set-master-effort", (masterEffort) => saveSettings({ masterEffort }))
  onSelect("set-worker-effort", (workerEffort) => saveSettings({ workerEffort }))
  onToggle("set-auto-worker-effort", (autoWorkerEffort) => saveSettings({ autoWorkerEffort }))
  onSelect("set-permission", (v) => saveSettings({ permissionMode: v as Settings["permissionMode"] }))
  onSelect("set-keep-awake", (v) => api.setPowerMode(v as KeepAwake))
}
