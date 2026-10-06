// Markdown is never rendered as HTML.

import type { ChatEventOf } from "../../shared/chat.ts"
import { el } from "../dom.ts"
import { fmtTokens, wireToggle } from "./format.ts"
import { capBlocks, type ChatSession, ensureTurn, stick, type TextBlock, type ThinkBlock } from "./state.ts"

interface Segment {
  readonly code: boolean
  readonly text: string
  readonly lang?: string
}

// Prose and fenced code, syntactic only.
const parseSegments = (raw: string): Array<Segment> => {
  const segs: Array<Segment> = []
  let prose: Array<string> = []
  let code: Array<string> | null = null
  let lang = ""
  const flushProse = () => {
    const t = prose.join("\n").replace(/^\n+|\n+$/g, "")
    if (t) segs.push({ code: false, text: t })
    prose = []
  }
  for (const line of raw.split("\n")) {
    const fence = /^\s*```(.*)$/.exec(line)
    if (fence && code === null) {
      flushProse()
      code = []
      lang = (fence[1] ?? "").trim()
    } else if (fence && code !== null) {
      segs.push({ code: true, text: code.join("\n"), lang })
      code = null
    } else if (code !== null) code.push(line)
    else prose.push(line)
  }
  if (code !== null) segs.push({ code: true, text: code.join("\n"), lang })
  flushProse()
  return segs
}

export const appendProse = (parent: HTMLElement, raw: string) => {
  const segs = parseSegments(raw)
  let tail: Text | null = null
  for (const seg of segs) {
    if (seg.code) {
      const wrap = el("div", "chat-codeblock")
      if (seg.lang) wrap.append(el("div", "chat-codelang", seg.lang))
      wrap.append(el("pre", "chat-code", seg.text))
      parent.append(wrap)
    } else {
      const p = el("div", "chat-prose", seg.text)
      parent.append(p)
      tail = p.firstChild as Text | null
    }
  }
  return { segs, tail }
}

const renderBlock = (b: TextBlock) => {
  b.el.replaceChildren()
  const { segs, tail } = appendProse(b.el, b.raw)
  b.fenced = segs.some((x) => x.code)
  b.tail = tail
  if (!segs.length) {
    const p = el("div", "chat-prose", "")
    b.el.append(p)
    b.tail = p.appendChild(document.createTextNode(""))
  }
  // Open code means the next delta re-renders.
  if (segs[segs.length - 1]?.code) b.tail = null
}

const newTextBlock = (s: ChatSession, key: string): TextBlock => {
  const turn = ensureTurn(s)
  const node = el("div", "chat-text streaming")
  turn.el.append(node)
  const b: TextBlock = { kind: "text", el: node, raw: "", pending: "", final: false, fenced: false, tail: null, raf: 0 }
  renderBlock(b)
  s.blocks.set(key, b)
  capBlocks(s)
  turn.hasText = true
  s.liveThink = null
  return b
}

const flushBlock = (s: ChatSession, b: TextBlock) => {
  b.raf = 0
  if (!b.pending) return
  const add = b.pending
  b.pending = ""
  // A fence can straddle two deltas.
  if (!b.fenced && b.tail && !`${b.raw.slice(-2)}${add}`.includes("```")) {
    b.tail.appendData(add)
    b.raw += add
  } else {
    b.raw += add
    renderBlock(b)
  }
  stick(s)
}

const textBlock = (s: ChatSession, key: string) => {
  const b = s.blocks.get(key)
  return b?.kind === "text" ? b : undefined
}

export const textDelta = (s: ChatSession, ev: ChatEventOf<"text-delta">) => {
  const key = `${s.epoch}:${ev.block}`
  let b = textBlock(s, key)
  if (!b || b.final) b = newTextBlock(s, key)
  const block = b
  block.pending += ev.text
  if (s.hydrating) flushBlock(s, block)
  else if (!block.raf) block.raf = requestAnimationFrame(() => flushBlock(s, block))
}

// Final text replaces the stream, never appends.
export const textFinal = (s: ChatSession, block: string, text: string) => {
  const key = `${s.epoch}:${block}`
  let b = textBlock(s, key)
  if (b?.final) {
    if (b.raw === text) return
    b = undefined
  }
  if (!b) b = newTextBlock(s, key)
  if (b.raf) {
    cancelAnimationFrame(b.raf)
    b.raf = 0
  }
  b.pending = ""
  // Rerender undoes literal fences from the fast path.
  b.raw = text
  renderBlock(b)
  b.final = true
  b.el.classList.remove("streaming")
  stick(s)
}

export const thinking = (s: ChatSession, ev: ChatEventOf<"thinking">) => {
  const key = `t${s.epoch}:${ev.block}`
  let b = s.blocks.get(key) as ThinkBlock | undefined
  if (!b) {
    const turn = ensureTurn(s)
    const wrap = el("div", "chat-think")
    const head = el("button", "chat-think-toggle")
    head.type = "button"
    const label = el("span", "chat-think-label", "Thinking")
    const meta = el("span", "chat-think-meta")
    head.append(el("span", "chat-chev", "›"), label, meta)
    const body = el("div", "chat-think-body")
    wireToggle(head, body)
    wrap.append(head, body)
    turn.el.append(wrap)
    b = { kind: "think", final: true, el: wrap, label, meta, body }
    s.blocks.set(key, b)
  }
  s.liveThink = b
  b.el.classList.add("live")
  b.body.textContent = ev.text
  if (ev.tokens) b.meta.textContent = `${fmtTokens(ev.tokens)} tokens`
  stick(s)
}

export const settleThinking = (s: ChatSession) => {
  const b = s.liveThink
  if (!b) return
  b.el.classList.remove("live")
  b.label.textContent = "Thought"
  s.liveThink = null
}
