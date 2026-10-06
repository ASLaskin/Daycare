// Chat pane API

import type { ChatEvent } from "../../shared/chat.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { SessionView } from "../../shared/session.ts"
import { onSettingsChanged } from "../store.ts"
import { prune } from "./caps.ts"
import { autosize, wireComposer } from "./composer.ts"
import { apply } from "./events.ts"
import { renderFoot } from "./foot.ts"
import { toBottom, updateJump } from "./scroll.ts"
import type { ChatSession } from "./types.ts"
import { buildView } from "./view.ts"

const sessions = new Map<SessionId, ChatSession>()
let subscribed = false

const restoreScroll = (s: ChatSession) => {
  if (s.pinned) {
    toBottom(s)
    return
  }
  s.scroll.scrollTop = s.savedTop
}

// Restore the scroll offset when a hidden pane reappears
const onResize = (s: ChatSession) => {
  if (!s.scroll.clientHeight) {
    s.wasHidden = true
    return
  }
  if (s.wasHidden) {
    s.wasHidden = false
    restoreScroll(s)
  }
  autosize(s.input)
  updateJump(s)
}

export const mount = (info: SessionView, host: HTMLElement) => {
  if (sessions.has(info.id)) {
    dispose(info.id)
  }
  host.classList.add("chat-host")
  const v = buildView(info, host)
  const ro = new ResizeObserver(() => onResize(s))
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
    emptyEl: v.empty,
    stats: { model: info.model || "", cost: 0, ctx: 0, turns: 0, rate: null },
    wasHidden: false,
    savedTop: 0,
    timers: new Set(),
    ro,
    root: v.root,
    scroll: v.scroll,
    thread: v.thread,
    working: v.working,
    jump: v.jump,
    input: v.input,
    send: v.send,
    stop: v.stop,
    foot: v.foot,
    taskbar: v.taskbar,
    taskList: v.taskList,
    taskSummary: v.taskSummary,
  }
  wireComposer(s)
  ro.observe(v.scroll)
  sessions.set(info.id, s)
  renderFoot(s)
  if (!subscribed) {
    subscribed = true
    onSettingsChanged(() => sessions.forEach(renderFoot))
  }
}

// Replay history, skipping events already applied live
export const hydrate = (id: SessionId, events: ReadonlyArray<ChatEvent>) => {
  const s = sessions.get(id)
  if (!s) {
    return
  }
  const skip = Math.min(s.applied, events.length)
  s.hydrating = true
  s.root.classList.add("replaying")
  try {
    events.slice(skip).forEach((ev) => apply(s, ev))
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

export const event = (id: SessionId, ev: ChatEvent) => {
  const s = sessions.get(id)
  if (s) {
    apply(s, ev)
  }
}

// Put text first in the composer, moving any draft below
export const insert = (id: SessionId, text: string): boolean => {
  const s = sessions.get(id)
  if (!s || s.ended) {
    return false
  }
  const cur = s.input.value
  s.input.value = cur.trim() ? `${text}\n${cur}` : text
  s.input.dispatchEvent(new Event("input"))
  s.input.focus()
  s.input.setSelectionRange(text.length, text.length)
  return true
}

export const focus = (id: SessionId) => {
  const s = sessions.get(id)
  if (s && !s.ended) {
    s.input.focus()
  }
}

export const isRunning = (id: SessionId): boolean => sessions.get(id)?.running ?? false

export const dispose = (id: SessionId) => {
  const s = sessions.get(id)
  if (!s) {
    return
  }
  s.ro.disconnect()
  if (s.stickRaf) {
    cancelAnimationFrame(s.stickRaf)
  }
  ;[...s.blocks.values()].forEach((b) => {
    if (b.kind === "text" && b.raf) {
      cancelAnimationFrame(b.raf)
    }
  })
  s.timers.forEach(clearTimeout)
  s.timers.clear()
  s.host.classList.remove("chat-host")
  s.root.remove()
  s.blocks.clear()
  s.tools.clear()
  s.perms.clear()
  s.tasks.clear()
  sessions.delete(id)
}
