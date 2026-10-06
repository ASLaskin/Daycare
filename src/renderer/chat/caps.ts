import { updateJump } from "./scroll.ts"
import type { ChatSession } from "./types.ts"

// Size limits for live sessions
const MAX_NODES = 300
const MAX_TOOLS = 400
const MAX_BLOCKS = 200
export const MAX_TASKS = 60
export const MAX_PERMS = 80

// Drop the oldest entries past the limit
export const capMap = <K, V>(m: Map<K, V>, limit: number) => {
  const extra = [...m.keys()].slice(0, Math.max(0, m.size - limit))
  extra.forEach((k) => m.delete(k))
}

// Drop the oldest finished tool cards past the limit
export const capTools = (s: ChatSession) => {
  const extra = s.tools.size - MAX_TOOLS
  if (extra <= 0) {
    return
  }
  const done = [...s.tools].filter(([, card]) => card.done).slice(0, extra)
  done.forEach(([k]) => s.tools.delete(k))
}

// Drop the oldest settled blocks past the limit
export const capBlocks = (s: ChatSession) => {
  const extra = s.blocks.size - MAX_BLOCKS
  if (extra <= 0) {
    return
  }
  const settled = [...s.blocks].filter(([, b]) => b.final && b !== s.liveThink).slice(0, extra)
  settled.forEach(([k]) => s.blocks.delete(k))
}

const removable = (s: ChatSession, node: Element | undefined) =>
  node !== undefined && node !== s.working && node !== s.turn?.el && node !== s.emptyEl

// Remove old thread nodes, keeping the visible passage in place
const trimThread = (s: ChatSession) => {
  const kids = s.thread.children
  if (kids.length - 1 <= MAX_NODES) {
    return
  }
  const before = s.scroll.scrollHeight
  const top = s.scroll.scrollTop
  while (kids.length - 1 > MAX_NODES && removable(s, kids[0])) {
    kids[0]!.remove()
  }
  const lost = before - s.scroll.scrollHeight
  if (!s.pinned && lost > 0) {
    s.scroll.scrollTop = Math.max(0, top - lost)
    s.savedTop = s.scroll.scrollTop
  }
  updateJump(s)
}

export const prune = (s: ChatSession) => {
  if (s.hydrating) {
    return
  }
  trimThread(s)
  capTools(s)
  capMap(s.perms, MAX_PERMS)
}
