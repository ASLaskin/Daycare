import type { ChatEvent, ChatEventOf } from "../../shared/chat.ts"
import { el, tildify } from "../dom.ts"
import { prune } from "./caps.ts"
import { renderFoot } from "./foot.ts"
import { cap } from "./format.ts"
import { permission, resolvePerm } from "./permissions.ts"
import { setRunning } from "./running.ts"
import { stick } from "./scroll.ts"
import { renderTasks, task } from "./tasks.ts"
import { textDelta, textFinal } from "./text.ts"
import { settleThinking, thinking } from "./thinking.ts"
import { toolEnd, toolStart } from "./tools.ts"
import { clearEmpty, closeTurn, notice } from "./turn.ts"
import type { ChatSession } from "./types.ts"

// total_cost_usd is a running total
const COST_IS_CUMULATIVE = true

const ready = (s: ChatSession, ev: ChatEventOf<"ready">) => {
  if (ev.model) {
    s.stats.model = ev.model
  }
  if (ev.cwd) {
    s.cwd = ev.cwd
  }
  const sub = s.emptyEl?.querySelector(".chat-empty-sub")
  if (sub) {
    sub.textContent = tildify(s.cwd)
  }
  renderFoot(s)
}

const userMessage = (s: ChatSession, text: string) => {
  closeTurn(s)
  clearEmpty(s)
  s.tasks.clear()
  renderTasks(s)
  prune(s)
  const m = el("div", "chat-msg chat-user")
  m.append(el("div", "chat-bubble", text))
  s.thread.insertBefore(m, s.working)
  s.pinned = true
  stick(s)
}

const turnEnd = (s: ChatSession, ev: ChatEventOf<"turn-end">) => {
  // Show result text that never streamed
  if (s.turn && !s.turn.hasText && ev.text) {
    textFinal(s, "result", ev.text)
  }
  if (ev.isError) {
    notice(s, "error", ev.stopReason ? `The turn ended with an error (${ev.stopReason}).` : "The turn ended with an error.")
  }
  s.stats.turns += 1
  s.stats.cost = COST_IS_CUMULATIVE ? ev.costUsd : s.stats.cost + ev.costUsd
  if (ev.contextTokens) {
    s.stats.ctx = ev.contextTokens
  }
  closeTurn(s)
  setRunning(s, false)
  renderFoot(s)
}

const exitBox = (ev: ChatEventOf<"exit">) => {
  const box = el("div", "chat-exit")
  const code = ev.code == null ? "" : ` (exit code ${ev.code})`
  box.append(el("div", "chat-exit-title", `This session has ended${code}`))
  const tail = ev.stderrTail.trim()
  box.append(tail ? el("pre", "chat-pre err", cap(tail)) : el("div", "chat-exit-sub", "No error output was captured."))
  return box
}

const endSession = (s: ChatSession, ev: ChatEventOf<"exit">) => {
  closeTurn(s)
  setRunning(s, false)
  s.ended = true
  ;[...s.perms.values()]
    .filter((p) => !p.answered)
    .forEach((p) => {
      p.answered = true
      p.card.classList.add("stale")
      p.card.querySelectorAll("button").forEach((b) => (b.disabled = true))
    })
  clearEmpty(s)
  s.thread.insertBefore(exitBox(ev), s.working)
  s.root.classList.add("ended")
  s.input.disabled = true
  s.input.placeholder = "Session ended"
  s.send.disabled = true
  stick(s)
}

const resolved = (s: ChatSession, ev: ChatEventOf<"permission-resolved">) => {
  const p = s.perms.get(ev.requestId)
  if (p && !p.card.classList.contains("chat-perm-done")) {
    resolvePerm(s, ev.requestId, ev.allowed)
  }
}

const rateLimit = (s: ChatSession, ev: ChatEventOf<"rate-limit">) => {
  s.stats.rate = ev.percent
  renderFoot(s)
}

const HANDLERS: { readonly [K in ChatEvent["kind"]]: (s: ChatSession, ev: ChatEventOf<K>) => void } = {
  ready,
  state: (s, ev) => setRunning(s, ev.state === "running"),
  user: (s, ev) => userMessage(s, ev.text),
  "text-delta": (s, ev) => {
    settleThinking(s)
    textDelta(s, ev)
  },
  text: (s, ev) => {
    settleThinking(s)
    textFinal(s, ev.block, ev.text)
  },
  thinking,
  "tool-start": toolStart,
  "tool-end": toolEnd,
  permission,
  "permission-resolved": resolved,
  "turn-end": turnEnd,
  task,
  "rate-limit": rateLimit,
  error: (s, ev) => notice(s, "error", ev.message || "Something went wrong."),
  exit: endSession,
}

// Draw one event; counts every kind main replays
export const apply = (s: ChatSession, ev: ChatEvent) => {
  if (ev.kind !== "text-delta") {
    s.applied += 1
  }
  const handler = HANDLERS[ev.kind] as (s: ChatSession, ev: ChatEvent) => void
  handler(s, ev)
}
