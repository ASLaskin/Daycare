// Keep awake status and sidebar badge.

import type { PowerStatus } from "../shared/power.ts"
import { api } from "./api.ts"
import { $ } from "./dom.ts"
import { saveSettings, settings } from "./store.ts"

const describe = ({ mode, holding, lidClosedActive, error, busyCount }: PowerStatus) => {
  const working = `${busyCount} session${busyCount === 1 ? "" : "s"} working`
  if (error) {
    return error
  }
  if (holding) {
    const reason = mode === "always" ? "always on" : working
    return `Holding your Mac awake, ${reason}${lidClosedActive ? ", lid close included" : ""}.`
  }
  if (lidClosedActive) {
    return "Sessions are done, lid close keeps the Mac awake a few more minutes."
  }
  return `Not holding anything right now, ${working}.`
}

const badgeText = ({ holding, lidClosedActive }: PowerStatus) => {
  if (!holding) {
    return ""
  }
  return lidClosedActive ? "Awake, lid closed" : "Keeping awake"
}

const renderPower = (power: PowerStatus) => {
  const { holding, lidClosedActive, error, stale } = power
  const box = $("#power-state")
  box.classList.toggle("error", !!error)
  box.textContent = describe(power)
  $("#power-restore").classList.toggle("hidden", !stale)
  $("#power-dismiss").classList.toggle("hidden", !error || stale)
  const badge = $("#power-badge")
  badge.classList.toggle("hidden", !holding)
  badge.textContent = badgeText(power)
  // Failed admin prompt turns the lid switch off.
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
