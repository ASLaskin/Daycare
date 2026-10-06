// Context rings on panes and the plan usage box.

import type { Usage } from "../shared/usage.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { settings } from "./store.ts"

type Level = "green" | "amber" | "red"

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const showContext = () => settings().showContext

export const contextLevel = (tokens: number): Level => {
  const limit = settings().contextLimit
  if (tokens >= limit) return "red"
  if (tokens >= limit * 0.66) return "amber"
  return "green"
}

const meter = (fraction: number, level: Level) => {
  const bar = el("span", `meter ${level}`)
  const fill = el("span")
  fill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`
  bar.append(fill)
  return bar
}

const SVG_NS = "http://www.w3.org/2000/svg"
const RING_R = 7
const RING_C = 2 * Math.PI * RING_R

const ring = (fraction: number, level: Level) => {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", "0 0 18 18")
  svg.setAttribute("class", `ring ${level}`)
  let fill: SVGCircleElement | null = null
  for (const cls of ["track", "fill"]) {
    const c = document.createElementNS(SVG_NS, "circle")
    c.setAttribute("class", cls)
    c.setAttribute("cx", "9")
    c.setAttribute("cy", "9")
    c.setAttribute("r", String(RING_R))
    svg.append(c)
    fill = c
  }
  const f = Math.min(1, Math.max(0, fraction))
  fill!.style.strokeDasharray = `${f * RING_C} ${RING_C}`
  return svg
}

export const renderContext = (node: HTMLElement, tokens: number) => {
  node.replaceChildren()
  if (!tokens || !showContext()) return
  const { contextScale: scale, contextLimit: limit } = settings()
  const level = contextLevel(tokens)
  node.className = `ctx ${level}`
  const tip = el("span", "ctx-tip")
  const line = (label: string, value: string) => {
    const r = el("span", "tip-row")
    r.append(el("span", null, label), el("span", "tip-val", value))
    tip.append(r)
  }
  line("In context", `${tokens.toLocaleString()} tokens`)
  line("Of scale", `${Math.round((tokens / scale) * 100)}% of ${fmtTokens(scale)}`)
  line(tokens >= limit ? "Over red by" : "Until red", fmtTokens(Math.abs(limit - tokens)))
  node.append(ring(tokens / scale, level), tip)
}

let usage: Usage | null = null

const resetLabel = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const ms = d.getTime() - Date.now()
  if (ms <= 0) return "resetting"
  const h = Math.floor(ms / 3.6e6)
  const m = Math.round((ms % 3.6e6) / 6e4)
  if (h < 24) return h ? `resets in ${h}h ${m}m` : `resets in ${m}m`
  return `resets ${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
}

const usageLevel = (pct: number): Level => (pct >= 90 ? "red" : pct >= 70 ? "amber" : "green")

const age = (fetchedAt: number) => {
  const mins = Math.floor((Date.now() - fetchedAt) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

const renderUsage = () => {
  const box = $("#usage")
  box.replaceChildren()
  if (!usage || !usage.limits.length) {
    box.append(el("div", "usage-note", "Plan usage"))
    return
  }
  for (const l of usage.limits) {
    const row = el("div", "usage-row")
    const top = el("div", "usage-top")
    const pct = Math.round(l.percent)
    top.append(el("span", "usage-label", l.label), el("span", `usage-pct ${usageLevel(pct)}`, `${pct}%`))
    row.append(top, meter(pct / 100, usageLevel(pct)), el("div", "usage-reset", resetLabel(l.resetsAt)))
    box.append(row)
  }
  // A failed refresh keeps the last numbers.
  if (usage.fetchedAt) box.append(el("div", "usage-note", `Updated ${age(usage.fetchedAt)}`))
}

export const initUsage = () => {
  const set = (u: Usage) => {
    usage = u
    renderUsage()
  }
  api.getUsage().then(set)
  api.onUsage(set)
  const box = $("#usage")
  box.onclick = () => {
    box.classList.add("refreshing")
    api.refreshUsage().finally(() => box.classList.remove("refreshing"))
  }
  // Keeps countdowns current between fetches.
  setInterval(renderUsage, 30000)
}
