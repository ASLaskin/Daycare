// Keep awake status, mode picker and sidebar badge.

import type { PowerState, PowerStatus } from "../shared/power.ts"
import { api } from "./api.ts"
import { $ } from "./dom.ts"
import { select } from "./fields.ts"
import { saveSettings, settings } from "./store.ts"

const describe = (power: PowerState | null, lidClosedActive: boolean, error: string | null) => {
  if (error) {
    return error
  }
  if (!power) {
    return "The coordinator is not reachable, so keep awake is unknown right now."
  }
  if (power.error) {
    return power.error
  }
  const working = `${power.busyCount} session${power.busyCount === 1 ? "" : "s"} working`
  if (power.holding) {
    const reason = power.mode === "always" ? "always on" : working
    return `Holding your Mac awake, ${reason}${lidClosedActive ? ", lid close included" : ""}.`
  }
  if (lidClosedActive) {
    return "Sessions are done, lid close keeps the Mac awake a few more minutes."
  }
  return `Not holding anything right now, ${working}.`
}

const badgeText = (holding: boolean, lidClosedActive: boolean) => {
  if (!holding) {
    return ""
  }
  return lidClosedActive ? "Awake, lid closed" : "Keeping awake"
}

const renderPower = ({ power, lidClosedActive, error, stale }: PowerStatus) => {
  const holding = power?.holding ?? false
  if (power) {
    select("set-keep-awake").value = power.mode
  }
  $("#keep-awake-lid-row").classList.toggle("collapsed", power?.mode === "off")
  const box = $("#power-state")
  box.classList.toggle("error", !!(error ?? power?.error))
  box.textContent = describe(power, lidClosedActive, error)
  $("#power-restore").classList.toggle("hidden", !stale)
  $("#power-dismiss").classList.toggle("hidden", !error || stale)
  const badge = $("#power-badge")
  badge.classList.toggle("hidden", !holding)
  badge.textContent = badgeText(holding, lidClosedActive)
  // Failed admin prompt turns the lid switch off
  if (error && !stale && settings().keepAwakeLidClosed && !lidClosedActive) {
    saveSettings({ keepAwakeLidClosed: false })
  }
}

export const initPowerView = () => {
  const restore = $<HTMLButtonElement>("#power-restore")
  restore.onclick = async () => {
    restore.disabled = true
    try {
      renderPower(await api.powerRestore())
    } finally {
      restore.disabled = false
    }
  }
  $("#power-dismiss").onclick = async () => renderPower(await api.powerDismissError())
  api.powerStatus().then(renderPower)
  api.onPower(renderPower)
}
