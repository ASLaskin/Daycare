import { el } from "../dom.ts"
import { ipcMessage } from "../ipc-error.ts"
import { prune } from "./caps.ts"
import { stick } from "./scroll.ts"
import type { ChatSession } from "./types.ts"

export const clearEmpty = (s: ChatSession) => {
  s.emptyEl?.remove()
  s.emptyEl = null
}

export const ensureTurn = (s: ChatSession) => {
  if (s.turn) {
    return s.turn
  }
  clearEmpty(s)
  prune(s)
  const t = el("div", "chat-msg chat-turn")
  s.thread.insertBefore(t, s.working)
  s.turn = { el: t, hasText: false }
  return s.turn
}

export const closeTurn = (s: ChatSession) => {
  ;[...s.blocks.values()].filter((b) => !b.final).forEach((b) => b.el.classList.remove("streaming"))
  s.turn = null
  s.blocks.clear()
  s.liveThink = null
  s.epoch += 1
}

export const notice = (s: ChatSession, kind: string, text: string, extra?: string) => {
  const t = ensureTurn(s)
  const n = el("div", `chat-note ${kind}`)
  n.append(el("div", "chat-note-text", text))
  if (extra) {
    n.append(el("pre", "chat-pre err", extra))
  }
  t.el.append(n)
  stick(s)
}

export const errorText = (err: unknown) => ipcMessage(err, "unknown error")
