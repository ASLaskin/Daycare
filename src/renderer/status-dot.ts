// Status dots and their shared hover peek card.

import type { SessionView } from "../shared/session.ts"
import { fmtTokens, showContext } from "./context-meter.ts"
import { el, setClass, setText } from "./dom.ts"
import { STATUS_LABEL } from "./status.ts"
import { workerSummary } from "./worker-summary.ts"

export const paintDot = (dot: HTMLElement, info: SessionView) => {
  setClass(dot, `status-dot ${info.status}`)
  dot.setAttribute("aria-label", `${info.name}, ${STATUS_LABEL[info.status]}`)
}

export const statusDot = (info: SessionView) => {
  const dot = el("span")
  paintDot(dot, info)
  return dot
}

let card: HTMLElement | null = null

const peekCard = () => {
  if (!card) {
    card = el("div", "peek")
    document.body.append(card)
  }
  return card
}

const peekLines = (info: SessionView) => {
  const status = el("span", `status ${info.status}`, STATUS_LABEL[info.status])
  const head = el("div", "peek-head")
  head.append(el("span", "peek-name", info.name), status)
  const ctx = info.context > 0 && showContext() ? [el("div", "peek-line", `${fmtTokens(info.context)} tokens in context`)] : []
  const workers = info.role === "master" && info.status !== "closed" ? [el("div", "peek-line", workerSummary(info.id))] : []
  return [head, ...ctx, ...workers]
}

// Beside the target, flipped left near the window edge.
const place = (node: HTMLElement, target: HTMLElement) => {
  const r = target.getBoundingClientRect()
  const gap = 10
  const right = r.right + gap + node.offsetWidth <= window.innerWidth
  node.style.left = `${right ? r.right + gap : r.left - gap - node.offsetWidth}px`
  const top = r.top + r.height / 2 - node.offsetHeight / 2
  node.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - node.offsetHeight - gap))}px`
}

const hidePeek = () => card?.classList.remove("shown")

export const wirePeek = (target: HTMLElement, current: () => SessionView) => {
  target.addEventListener("mouseenter", () => {
    const node = peekCard()
    node.replaceChildren(...peekLines(current()))
    place(node, target)
    node.classList.add("shown")
  })
  target.addEventListener("mouseleave", hidePeek)
  target.addEventListener("click", hidePeek)
}
