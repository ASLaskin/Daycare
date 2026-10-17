import type { ChatEventOf } from "../../shared/chat.ts"
import type { DirPath } from "../../shared/ids.ts"
import { el } from "../dom.ts"
import { capBlocks } from "./caps.ts"
import { stick } from "./scroll.ts"
import { appendProse } from "./segments.ts"
import { ensureTurn } from "./turn.ts"
import type { ChatSession, TextBlock } from "./types.ts"

const renderBlock = (b: TextBlock, linkCwd: DirPath | null = null) => {
  b.el.replaceChildren()
  const { segs, tail } = appendProse(b.el, b.raw, linkCwd)
  b.fenced = segs.some((x) => x.code)
  b.tail = tail
  if (!segs.length) {
    const p = el("div", "chat-prose", "")
    b.el.append(p)
    b.tail = p.appendChild(document.createTextNode(""))
  }
  // No fast append target inside open code
  if (segs[segs.length - 1]?.code) {
    b.tail = null
  }
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

// Append in place unless a code fence may appear
const appendText = (b: TextBlock, add: string) => {
  const tail = !b.fenced && !`${b.raw.slice(-2)}${add}`.includes("```") ? b.tail : null
  b.raw += add
  if (tail) {
    tail.appendData(add)
    return
  }
  renderBlock(b)
}

const flushBlock = (s: ChatSession, b: TextBlock) => {
  b.raf = 0
  if (!b.pending) {
    return
  }
  const add = b.pending
  b.pending = ""
  appendText(b, add)
  stick(s)
}

const textBlock = (s: ChatSession, key: string) => {
  const b = s.blocks.get(key)
  return b?.kind === "text" ? b : undefined
}

export const textDelta = (s: ChatSession, ev: ChatEventOf<"text-delta">) => {
  const key = `${s.epoch}:${ev.block}`
  const found = textBlock(s, key)
  const block = !found || found.final ? newTextBlock(s, key) : found
  block.pending += ev.text
  if (s.hydrating) {
    flushBlock(s, block)
    return
  }
  if (!block.raf) {
    block.raf = requestAnimationFrame(() => flushBlock(s, block))
  }
}

// Replace the streamed text with the final text
export const textFinal = (s: ChatSession, block: string, text: string) => {
  const key = `${s.epoch}:${block}`
  const found = textBlock(s, key)
  if (found?.final && found.raw === text) {
    return
  }
  const b = !found || found.final ? newTextBlock(s, key) : found
  if (b.raf) {
    cancelAnimationFrame(b.raf)
    b.raf = 0
  }
  b.pending = ""
  b.raw = text
  renderBlock(b, s.cwd)
  b.final = true
  b.el.classList.remove("streaming")
  stick(s)
}
