// Context token ring and its levels.

import { el } from "./dom.ts"
import { settings } from "./store.ts"

export type Level = "green" | "amber" | "red"

const SVG_NS = "http://www.w3.org/2000/svg"
const RING_R = 7
const RING_C = 2 * Math.PI * RING_R

export const fmtTokens = (n: number) => {
  if (n >= 1e6) {
    return `${+(n / 1e6).toFixed(2)}M`
  }
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

export const showContext = () => settings().showContext

export const contextLevel = (tokens: number): Level => {
  const limit = settings().contextLimit
  if (tokens >= limit) {
    return "red"
  }
  return tokens >= limit * 0.66 ? "amber" : "green"
}

const circle = (cls: string) => {
  const c = document.createElementNS(SVG_NS, "circle")
  c.setAttribute("class", cls)
  c.setAttribute("cx", "9")
  c.setAttribute("cy", "9")
  c.setAttribute("r", String(RING_R))
  return c
}

const ring = (fraction: number, level: Level) => {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", "0 0 18 18")
  svg.setAttribute("class", `ring ${level}`)
  const fill = circle("fill")
  const f = Math.min(1, Math.max(0, fraction))
  fill.style.strokeDasharray = `${f * RING_C} ${RING_C}`
  svg.append(circle("track"), fill)
  return svg
}

const tipRow = (label: string, value: string) => {
  const r = el("span", "tip-row")
  r.append(el("span", null, label), el("span", "tip-val", value))
  return r
}

export const renderContext = (node: HTMLElement, tokens: number) => {
  node.replaceChildren()
  if (!tokens || !showContext()) {
    return
  }
  const { contextScale: scale, contextLimit: limit } = settings()
  const level = contextLevel(tokens)
  node.className = `ctx ${level}`
  const tip = el("span", "ctx-tip")
  tip.append(
    tipRow("In context", `${tokens.toLocaleString()} tokens`),
    tipRow("Of scale", `${Math.round((tokens / scale) * 100)}% of ${fmtTokens(scale)}`),
    tipRow(tokens >= limit ? "Over red by" : "Until red", fmtTokens(Math.abs(limit - tokens))),
  )
  node.append(ring(tokens / scale, level), tip)
}
