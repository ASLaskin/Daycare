import type { ChatEventOf } from "../../shared/chat.ts"
import { el } from "../dom.ts"
import { wireToggle } from "./controls.ts"
import { fmtTokens } from "./format.ts"
import { stick } from "./scroll.ts"
import { ensureTurn } from "./turn.ts"
import type { ChatSession, ThinkBlock } from "./types.ts"

const newThinkBlock = (s: ChatSession, key: string): ThinkBlock => {
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
  const b: ThinkBlock = { kind: "think", final: true, el: wrap, label, meta, body }
  s.blocks.set(key, b)
  return b
}

export const thinking = (s: ChatSession, ev: ChatEventOf<"thinking">) => {
  const key = `t${s.epoch}:${ev.block}`
  const b = (s.blocks.get(key) as ThinkBlock | undefined) ?? newThinkBlock(s, key)
  s.liveThink = b
  b.el.classList.add("live")
  b.body.textContent = ev.text
  if (ev.tokens) {
    b.meta.textContent = `${fmtTokens(ev.tokens)} tokens`
  }
  stick(s)
}

export const settleThinking = (s: ChatSession) => {
  const b = s.liveThink
  if (!b) {
    return
  }
  b.el.classList.remove("live")
  b.label.textContent = "Thought"
  s.liveThink = null
}
