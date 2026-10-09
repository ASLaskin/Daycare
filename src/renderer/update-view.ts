// Settings update card.

import { api } from "./api.ts"
import { $, tildify } from "./dom.ts"

const BUILT_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }

const renderUpdateInfo = async () => {
  const info = await api.updateInfo()
  const status = $("#update-status")
  if (!info) {
    status.textContent = "This build does not know its source folder. Rebuild once from the terminal."
    $<HTMLButtonElement>("#run-update").disabled = true
    return
  }
  const built = info.builtAt ? new Date(info.builtAt).toLocaleString(undefined, BUILT_FORMAT) : null
  const on = info.branch ? `On ${info.branch} at` : "Built from"
  status.textContent = info.commit
    ? `${on} ${info.commit}, ${built}. Pulls the branch below, rebuilds, and restarts. Sessions resume.`
    : `Pulls the branch below into ${tildify(info.sourceDir)} and rebuilds the installed app.`
}

const runUpdate = async (btn: HTMLButtonElement, source: HTMLInputElement) => {
  const log = $("#update-log")
  btn.disabled = true
  source.disabled = true
  btn.textContent = "Updating"
  log.textContent = ""
  log.classList.remove("hidden", "error")
  const stop = api.onUpdateLog((chunk) => {
    log.textContent += chunk
    log.scrollTop = log.scrollHeight
  })
  const res = await api.runUpdate(source.value)
  stop()
  log.textContent = res.log || log.textContent
  log.scrollTop = log.scrollHeight
  if (res.ok) {
    btn.textContent = "Restarting"
    return
  }
  log.classList.add("error")
  btn.textContent = "Pull and rebuild"
  btn.disabled = false
  source.disabled = false
}

export const initUpdateView = () => {
  const btn = $<HTMLButtonElement>("#run-update")
  const source = $<HTMLInputElement>("#update-source")
  btn.onclick = () => runUpdate(btn, source)
  source.onkeydown = (e) => {
    if (e.key === "Enter" && !btn.disabled) {
      runUpdate(btn, source)
    }
  }
  renderUpdateInfo()
}
