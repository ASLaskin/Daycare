// Sidebar plan usage box.

import type { Usage, UsageLimit } from "../shared/usage.ts"
import { api } from "./api.ts"
import { type Level, ring } from "./context-meter.ts"
import { $, el } from "./dom.ts"

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }

let usage: Usage | null = null

const meter = (fraction: number, level: Level) => {
  const bar = el("span", `meter ${level}`)
  const fill = el("span")
  fill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`
  bar.append(fill)
  return bar
}

const resetLabel = (iso: string | null) => {
  if (!iso) {
    return ""
  }
  const d = new Date(iso)
  const ms = d.getTime() - Date.now()
  if (ms <= 0) {
    return "resetting"
  }
  const h = Math.floor(ms / 3.6e6)
  const m = Math.round((ms % 3.6e6) / 6e4)
  if (h >= 24) {
    return `resets ${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleTimeString(undefined, TIME_FORMAT)}`
  }
  return h ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

const usageLevel = (pct: number): Level => {
  if (pct >= 90) {
    return "red"
  }
  return pct >= 70 ? "amber" : "green"
}

const age = (fetchedAt: number) => {
  const mins = Math.floor((Date.now() - fetchedAt) / 60000)
  if (mins < 1) {
    return "just now"
  }
  if (mins < 60) {
    return `${mins}m ago`
  }
  return mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`
}

const limitRow = (l: UsageLimit) => {
  const row = el("div", "usage-row")
  const top = el("div", "usage-top")
  const pct = Math.round(l.percent)
  top.append(el("span", "usage-label", l.label), el("span", `usage-pct ${usageLevel(pct)}`, `${pct}%`))
  row.append(top, meter(pct / 100, usageLevel(pct)), el("div", "usage-reset", resetLabel(l.resetsAt)))
  return row
}

const usageRows = () => {
  if (!usage || !usage.limits.length) {
    return [el("div", "usage-note", "Not loaded yet")]
  }
  const rows = usage.limits.map(limitRow)
  return usage.fetchedAt ? [...rows, el("div", "usage-note", `Updated ${age(usage.fetchedAt)}`)] : rows
}

// The collapsed sidebar's ring tracks the most used limit.
const renderRing = () => {
  const top = Math.max(0, ...(usage?.limits ?? []).map((l) => Math.round(l.percent)))
  $("#usage-ring-icon").replaceChildren(ring(top / 100, usageLevel(top)))
  const head = el("div", "usage-head", "Plan usage")
  $("#usage-tip").replaceChildren(head, ...usageRows())
}

const renderUsage = () => {
  $("#usage-body").replaceChildren(...usageRows())
  renderRing()
}

export const initUsage = () => {
  const set = (u: Usage) => {
    usage = u
    renderUsage()
  }
  api.getUsage().then(set)
  api.onUsage(set)
  for (const box of [$("#usage"), $("#usage-ring")]) {
    box.onclick = () => {
      box.classList.add("refreshing")
      api.refreshUsage().finally(() => box.classList.remove("refreshing"))
    }
  }
  // Refresh countdowns every 30 seconds.
  setInterval(renderUsage, 30000)
}
