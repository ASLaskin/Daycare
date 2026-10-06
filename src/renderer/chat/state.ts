import { el } from "../dom.ts"

export interface TextBlock {
  readonly kind: "text"
  readonly el: HTMLElement
  raw: string
  pending: string
  final: boolean
  fenced: boolean
  tail: Text | null
  raf: number
}

export interface ThinkBlock {
  readonly kind: "think"
  readonly final: true
  readonly el: HTMLElement
  readonly label: HTMLElement
  readonly meta: HTMLElement
  readonly body: HTMLElement
}

export type Block = TextBlock | ThinkBlock

export interface ToolCard {
  readonly wrap: HTMLElement
  readonly head: HTMLElement
  readonly arg: HTMLElement
  readonly note: HTMLElement
  readonly body: HTMLElement
  readonly kids: HTMLElement
  input: unknown
  done: boolean
  open: boolean
  isError: boolean
  content: string
  structured: unknown
}

export interface Perm {
  card: HTMLElement
  answered: boolean
  readonly name: string
  readonly what: string
  summary: ((allowed: boolean, label?: string) => string) | null
}

export interface TaskEntry {
  status?: string
  description?: string
  subagentType?: string
  summary?: string
  lastTool?: string
  usage?: unknown
}

export interface Stats {
  model: string
  cost: number
  ctx: number
  turns: number
  rate: number | null
}

export interface ChatSession {
  readonly id: string
  readonly name: string
  cwd: string
  readonly host: HTMLElement
  readonly blocks: Map<string, Block>
  readonly tools: Map<string, ToolCard>
  readonly perms: Map<string, Perm>
  readonly tasks: Map<string, TaskEntry>
  turn: { readonly el: HTMLElement; hasText: boolean } | null
  epoch: number
  // Events applied so far, so hydrate skips what came live.
  applied: number
  running: boolean
  stopping: boolean
  ended: boolean
  pinned: boolean
  hydrating: boolean
  stickRaf: number
  liveThink: ThinkBlock | null
  emptyEl: HTMLElement | null
  readonly stats: Stats
  wasHidden: boolean
  savedTop: number
  readonly timers: Set<ReturnType<typeof setTimeout>>
  readonly ro: ResizeObserver
  readonly root: HTMLElement
  readonly scroll: HTMLElement
  readonly thread: HTMLElement
  readonly working: HTMLElement
  readonly jump: HTMLElement
  readonly input: HTMLTextAreaElement
  readonly send: HTMLButtonElement
  readonly stop: HTMLButtonElement
  readonly foot: HTMLElement
  readonly taskbar: HTMLElement
  readonly taskList: HTMLElement
  readonly taskSummary: HTMLElement
}

const NEAR_BOTTOM_PX = 80

// Main caps replay only; live sessions need these.
const MAX_NODES = 300
const MAX_TOOLS = 400
const MAX_BLOCKS = 200
export const MAX_TASKS = 60
export const MAX_PERMS = 80

// ---------- scrolling ----------

export const atBottom = (s: ChatSession) => {
  const e = s.scroll
  return e.scrollHeight - e.scrollTop - e.clientHeight < NEAR_BOTTOM_PX
}

export const updateJump = (s: ChatSession) => {
  s.jump.hidden = s.pinned || s.scroll.scrollHeight <= s.scroll.clientHeight
}

export const toBottom = (s: ChatSession) => {
  s.scroll.scrollTop = s.scroll.scrollHeight
  s.pinned = true
  updateJump(s)
}

// Follow new content only when already at bottom.
export const stick = (s: ChatSession) => {
  if (s.hydrating) return
  if (!s.pinned) {
    updateJump(s)
    return
  }
  if (s.stickRaf) return
  s.stickRaf = requestAnimationFrame(() => {
    s.stickRaf = 0
    if (s.pinned) toBottom(s)
  })
}

// ---------- size caps ----------

// Maps keep insertion order: oldest first.
export const capMap = (m: Map<string, unknown>, limit: number) => {
  while (m.size > limit) {
    const first = m.keys().next()
    if (first.done) break
    m.delete(first.value)
  }
}

// Unfinished cards stay so their result has a home.
export const capTools = (s: ChatSession) => {
  if (s.tools.size <= MAX_TOOLS) return
  for (const [k, card] of s.tools) {
    if (s.tools.size <= MAX_TOOLS) break
    if (card.done) s.tools.delete(k)
  }
}

export const capBlocks = (s: ChatSession) => {
  if (s.blocks.size <= MAX_BLOCKS) return
  for (const [k, b] of s.blocks) {
    if (s.blocks.size <= MAX_BLOCKS) break
    if (b.final && b !== s.liveThink) s.blocks.delete(k)
  }
}

// Keeps the reader's passage still while trimming above it.
const trimThread = (s: ChatSession) => {
  const kids = s.thread.children
  if (kids.length - 1 <= MAX_NODES) return
  const keep = s.turn ? s.turn.el : null
  const before = s.scroll.scrollHeight
  const top = s.scroll.scrollTop
  while (kids.length - 1 > MAX_NODES) {
    const first = kids[0]
    if (!first || first === s.working || first === keep || first === s.emptyEl) break
    first.remove()
  }
  if (!s.pinned) {
    const lost = before - s.scroll.scrollHeight
    if (lost > 0) {
      s.scroll.scrollTop = Math.max(0, top - lost)
      s.savedTop = s.scroll.scrollTop
    }
  }
  updateJump(s)
}

export const prune = (s: ChatSession) => {
  if (s.hydrating) return
  trimThread(s)
  capTools(s)
  capMap(s.perms, MAX_PERMS)
}

// ---------- turns ----------

export const clearEmpty = (s: ChatSession) => {
  if (s.emptyEl) {
    s.emptyEl.remove()
    s.emptyEl = null
  }
}

export const ensureTurn = (s: ChatSession) => {
  if (s.turn) return s.turn
  clearEmpty(s)
  prune(s)
  const t = el("div", "chat-msg chat-turn")
  s.thread.insertBefore(t, s.working)
  s.turn = { el: t, hasText: false }
  return s.turn
}

export const closeTurn = (s: ChatSession) => {
  for (const b of s.blocks.values()) if (!b.final) b.el.classList.remove("streaming")
  s.turn = null
  s.blocks.clear()
  s.liveThink = null
  s.epoch += 1
}

export const notice = (s: ChatSession, kind: string, text: string, extra?: string) => {
  const t = ensureTurn(s)
  const n = el("div", `chat-note ${kind}`)
  n.append(el("div", "chat-note-text", text))
  if (extra) n.append(el("pre", "chat-pre err", extra))
  t.el.append(n)
  stick(s)
}

export const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "unknown error")
