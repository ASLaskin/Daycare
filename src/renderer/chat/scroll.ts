import type { ChatSession } from "./types.ts"

const NEAR_BOTTOM_PX = 80

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

// Scroll to new content when pinned to the bottom
export const stick = (s: ChatSession) => {
  if (s.hydrating) {
    return
  }
  if (!s.pinned) {
    updateJump(s)
    return
  }
  if (s.stickRaf) {
    return
  }
  s.stickRaf = requestAnimationFrame(() => {
    s.stickRaf = 0
    if (s.pinned) {
      toBottom(s)
    }
  })
}
