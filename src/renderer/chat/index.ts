// All model text goes through textContent.

import type { ChatEvent, ChatEventOf } from "../../shared/chat.ts"
import type { SessionView } from "../../shared/session.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { onSettingsChanged, settings } from "../store.ts"
import { button, cap, contextLevel, fmtCost, fmtTokens, wireToggle } from "./format.ts"
import { permission, resolvePerm } from "./permissions.ts"
import { atBottom, type ChatSession, clearEmpty, closeTurn, errorText, notice, prune, stick, toBottom, updateJump } from "./state.ts"
import { renderTasks, task } from "./tasks.ts"
import { settleThinking, textDelta, textFinal, thinking } from "./text.ts"
import { toolEnd, toolStart } from "./tools.ts"

// total_cost_usd is a running total.
const COST_IS_CUMULATIVE = true
const COMPOSER_MAX_PX = 168

const sessions = new Map<string, ChatSession>()
let subscribed = false

const setRunning = (s: ChatSession, on: boolean) => {
  s.running = on
  if (!on) s.stopping = false
  s.root.classList.toggle("running", on)
  s.working.hidden = !on
  s.stop.hidden = !on
  s.stop.disabled = s.stopping
  const stopText = s.stop.querySelector(".chat-stop-text")
  if (stopText) stopText.textContent = s.stopping ? "Stopping" : "Stop"
  if (!on) settleThinking(s)
  stick(s)
}

const renderFoot = (s: ChatSession) => {
  const f = s.foot
  f.replaceChildren()
  const st = s.stats
  const bits: Array<HTMLElement> = []
  if (st.model) bits.push(el("span", "chat-foot-model", st.model))
  if (st.turns) bits.push(el("span", null, `${st.turns} ${st.turns === 1 ? "turn" : "turns"}`))
  if (st.cost > 0) bits.push(el("span", null, fmtCost(st.cost)))
  if (st.ctx) {
    const scale = settings().contextScale || 500000
    const level = contextLevel(st.ctx)
    const wrap = el("span", `chat-foot-ctx ${level}`)
    wrap.title = `${st.ctx.toLocaleString()} tokens in context`
    const bar = el("span", `meter ${level}`)
    const fill = el("span")
    fill.style.width = `${Math.min(100, Math.max(0, (st.ctx / scale) * 100))}%`
    bar.append(fill)
    wrap.append(bar, el("span", "chat-foot-num", `${fmtTokens(st.ctx)} / ${fmtTokens(scale)}`))
    bits.push(wrap)
  }
  if (st.rate != null) bits.push(el("span", st.rate >= 80 ? "chat-foot-warn" : null, `Rate limit ${Math.round(st.rate)}%`))
  f.hidden = bits.length === 0
  bits.forEach((b, i) => {
    if (i) f.append(el("span", "chat-foot-sep", "·"))
    f.append(b)
  })
}

const userMessage = (s: ChatSession, text: string) => {
  closeTurn(s)
  clearEmpty(s)
  // The strip belongs to the turn in flight.
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
  // Output that never streamed, like slash commands.
  if (s.turn && !s.turn.hasText && ev.text) textFinal(s, "result", ev.text)
  if (ev.isError) notice(s, "error", ev.stopReason ? `The turn ended with an error (${ev.stopReason}).` : "The turn ended with an error.")
  s.stats.turns += 1
  s.stats.cost = COST_IS_CUMULATIVE ? ev.costUsd : s.stats.cost + ev.costUsd
  if (ev.contextTokens) s.stats.ctx = ev.contextTokens
  closeTurn(s)
  setRunning(s, false)
  renderFoot(s)
}

const endSession = (s: ChatSession, ev: ChatEventOf<"exit">) => {
  closeTurn(s)
  setRunning(s, false)
  s.ended = true
  for (const p of s.perms.values()) {
    if (p.answered) continue
    p.answered = true
    p.card.classList.add("stale")
    p.card.querySelectorAll("button").forEach((b) => (b.disabled = true))
  }
  clearEmpty(s)
  const box = el("div", "chat-exit")
  const code = ev.code == null ? "" : ` (exit code ${ev.code})`
  box.append(el("div", "chat-exit-title", `This session has ended${code}`))
  const tail = ev.stderrTail.trim()
  if (tail) box.append(el("pre", "chat-pre err", cap(tail)))
  else box.append(el("div", "chat-exit-sub", "No error output was captured."))
  s.thread.insertBefore(box, s.working)
  s.root.classList.add("ended")
  s.input.disabled = true
  s.input.placeholder = "Session ended"
  s.send.disabled = true
  stick(s)
}

const apply = (s: ChatSession, ev: ChatEvent) => {
  // Main replays every event except deltas.
  if (ev.kind !== "text-delta") s.applied += 1
  switch (ev.kind) {
    case "ready": {
      if (ev.model) s.stats.model = ev.model
      if (ev.cwd) s.cwd = ev.cwd
      const sub = s.emptyEl?.querySelector(".chat-empty-sub")
      if (sub) sub.textContent = s.cwd
      renderFoot(s)
      break
    }
    case "state":
      setRunning(s, ev.state === "running")
      break
    case "user":
      userMessage(s, ev.text)
      break
    case "text-delta":
      settleThinking(s)
      textDelta(s, ev)
      break
    case "text":
      settleThinking(s)
      textFinal(s, ev.block, ev.text)
      break
    case "thinking":
      thinking(s, ev)
      break
    case "tool-start":
      toolStart(s, ev)
      break
    case "tool-end":
      toolEnd(s, ev)
      break
    case "permission":
      permission(s, ev)
      break
    case "permission-resolved": {
      const p = s.perms.get(ev.requestId)
      if (p && !p.card.classList.contains("chat-perm-done")) resolvePerm(s, ev.requestId, ev.allowed)
      break
    }
    case "turn-end":
      turnEnd(s, ev)
      break
    case "task":
      task(s, ev)
      break
    case "rate-limit":
      s.stats.rate = ev.percent
      renderFoot(s)
      break
    case "error":
      notice(s, "error", ev.message || "Something went wrong.")
      break
    case "exit":
      endSession(s, ev)
      break
  }
}

export const mount = (info: SessionView, host: HTMLElement) => {
  if (sessions.has(info.id)) dispose(info.id)
  host.classList.add("chat-host")

  const taskbar = el("div", "chat-tasks")
  taskbar.hidden = true
  const taskHead = button("chat-tasks-head")
  const taskSummary = el("span", "chat-tasks-summary")
  taskHead.append(el("span", "chat-chev", "›"), el("span", "chat-tasks-dot"), taskSummary)
  const taskList = el("div", "chat-tasks-list")
  wireToggle(taskHead, taskList)
  taskbar.append(taskHead, taskList)

  const scroll = el("div", "chat-scroll")
  scroll.tabIndex = -1
  scroll.setAttribute("role", "log")
  scroll.setAttribute("aria-label", "Conversation")
  const thread = el("div", "chat-thread")
  const working = el("div", "chat-working")
  working.hidden = true
  working.setAttribute("aria-label", "Working")
  working.append(el("span"), el("span"), el("span"))
  thread.append(working)
  scroll.append(thread)

  const jump = button("chat-jump", "Jump to latest")
  jump.hidden = true

  const composer = el("div", "chat-composer")
  const box = el("div", "chat-box")
  const input = el("textarea", "chat-input")
  input.rows = 1
  input.placeholder = "Message this session"
  input.setAttribute("aria-label", "Message")
  const stop = button("chat-stop")
  stop.hidden = true
  stop.title = "Interrupt the current turn (Esc)"
  stop.setAttribute("aria-label", "Stop")
  stop.append(el("span", "chat-stop-sq"), el("span", "chat-stop-text", "Stop"))
  const send = button("chat-send")
  send.disabled = true
  send.title = "Send (Enter)"
  send.setAttribute("aria-label", "Send")
  // Static markup, never model text.
  send.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3.5M4 7.5L8 3.5l4 4"/></svg>'
  const actions = el("div", "chat-actions")
  actions.append(stop, send)
  box.append(input, actions)
  composer.append(box, el("div", "chat-hint", "Enter to send, Shift+Enter for a new line"))

  const foot = el("div", "chat-foot")
  foot.hidden = true

  const root = el("div", "chat")
  const wrap = el("div", "chat-scroll-wrap")
  wrap.append(scroll, jump)
  root.append(taskbar, wrap, composer, foot)
  host.replaceChildren(root)

  // Removed by the first real content.
  const empty = el("div", "chat-empty")
  empty.append(el("div", "chat-empty-title", info.name ? `New chat in ${info.name}` : "New chat"), el("div", "chat-empty-sub", info.cwd))
  thread.prepend(empty)

  const autosize = () => {
    input.style.height = "auto"
    input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_PX)}px`
    input.style.overflowY = input.scrollHeight > COMPOSER_MAX_PX ? "auto" : "hidden"
  }

  // A hidden group loses its scroll offset.
  const ro = new ResizeObserver(() => {
    if (!scroll.clientHeight) {
      s.wasHidden = true
      return
    }
    if (s.wasHidden) {
      s.wasHidden = false
      if (s.pinned) toBottom(s)
      else scroll.scrollTop = s.savedTop
    }
    autosize()
    updateJump(s)
  })

  const s: ChatSession = {
    id: info.id,
    name: info.name,
    cwd: info.cwd,
    host,
    blocks: new Map(),
    tools: new Map(),
    perms: new Map(),
    tasks: new Map(),
    turn: null,
    epoch: 0,
    applied: 0,
    running: false,
    stopping: false,
    ended: false,
    pinned: true,
    hydrating: false,
    stickRaf: 0,
    liveThink: null,
    emptyEl: empty,
    stats: { model: info.model || "", cost: 0, ctx: 0, turns: 0, rate: null },
    wasHidden: false,
    savedTop: 0,
    timers: new Set(),
    ro,
    root,
    scroll,
    thread,
    working,
    jump,
    input,
    send,
    stop,
    foot,
    taskbar,
    taskList,
    taskSummary,
  }

  const sync = () => {
    send.disabled = s.ended || input.value.trim() === ""
    autosize()
  }
  const submit = () => {
    const text = input.value.trim()
    if (!text || s.ended) return
    input.value = ""
    sync()
    setRunning(s, true)
    s.pinned = true
    api.chatSend(s.id, text).catch((err: unknown) => {
      setRunning(s, false)
      notice(s, "error", `Could not send the message: ${errorText(err)}`)
    })
  }
  const interrupt = () => {
    if (!s.running || s.stopping) return
    s.stopping = true
    setRunning(s, true)
    api.chatInterrupt(s.id).catch(() => {
      s.stopping = false
      setRunning(s, true)
    })
  }

  input.addEventListener("input", sync)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      submit()
    }
  })
  send.addEventListener("click", () => {
    submit()
    input.focus()
  })
  stop.addEventListener("click", interrupt)
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && s.running && !e.isComposing) {
      e.preventDefault()
      interrupt()
    }
  })
  // Toggling a card changes height without scrolling.
  thread.addEventListener("click", () => {
    requestAnimationFrame(() => {
      s.pinned = atBottom(s)
      updateJump(s)
    })
  })
  jump.addEventListener("click", () => {
    toBottom(s)
    input.focus()
  })
  scroll.addEventListener(
    "scroll",
    () => {
      if (!scroll.clientHeight) return
      s.pinned = atBottom(s)
      s.savedTop = scroll.scrollTop
      updateJump(s)
    },
    { passive: true },
  )
  ro.observe(scroll)

  sessions.set(info.id, s)
  renderFoot(s)

  if (!subscribed) {
    subscribed = true
    onSettingsChanged(() => {
      for (const x of sessions.values()) renderFoot(x)
    })
  }
}

// Skips the prefix of history already applied live.
export const hydrate = (id: string, events: ReadonlyArray<ChatEvent>) => {
  const s = sessions.get(id)
  if (!s) return
  const skip = Math.min(s.applied, events.length)
  s.hydrating = true
  s.root.classList.add("replaying")
  try {
    for (const ev of events.slice(skip)) apply(s, ev)
  } finally {
    s.hydrating = false
    toBottom(s)
    prune(s)
    const t = setTimeout(() => {
      s.timers.delete(t)
      s.root.classList.remove("replaying")
    }, 50)
    s.timers.add(t)
  }
}

export const event = (id: string, ev: ChatEvent) => {
  const s = sessions.get(id)
  if (s) apply(s, ev)
}

// Slash commands must lead, so drafts move down.
export const insert = (id: string, text: string): boolean => {
  const s = sessions.get(id)
  if (!s || s.ended) return false
  const cur = s.input.value
  s.input.value = cur.trim() ? `${text}\n${cur}` : text
  s.input.dispatchEvent(new Event("input"))
  s.input.focus()
  s.input.setSelectionRange(text.length, text.length)
  return true
}

export const focus = (id: string) => {
  const s = sessions.get(id)
  if (s && !s.ended) s.input.focus()
}

export const isRunning = (id: string): boolean => sessions.get(id)?.running ?? false

export const dispose = (id: string) => {
  const s = sessions.get(id)
  if (!s) return
  s.ro.disconnect()
  if (s.stickRaf) cancelAnimationFrame(s.stickRaf)
  for (const b of s.blocks.values()) if (b.kind === "text" && b.raf) cancelAnimationFrame(b.raf)
  for (const t of s.timers) clearTimeout(t)
  s.timers.clear()
  s.host.classList.remove("chat-host")
  s.root.remove()
  s.blocks.clear()
  s.tools.clear()
  s.perms.clear()
  s.tasks.clear()
  sessions.delete(id)
}
