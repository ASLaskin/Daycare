import { api } from "../api.ts"
import { setRunning } from "./running.ts"
import { atBottom, toBottom, updateJump } from "./scroll.ts"
import { errorText, notice } from "./turn.ts"
import type { ChatSession } from "./types.ts"

const COMPOSER_MAX_PX = 168

export const autosize = (input: HTMLTextAreaElement) => {
  input.style.height = "auto"
  input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_PX)}px`
  input.style.overflowY = input.scrollHeight > COMPOSER_MAX_PX ? "auto" : "hidden"
}

const submit = (s: ChatSession, sync: () => void) => {
  const text = s.input.value.trim()
  if (!text || s.ended) {
    return
  }
  s.input.value = ""
  sync()
  setRunning(s, true)
  s.pinned = true
  api.chatSend(s.id, text).catch((err: unknown) => {
    setRunning(s, false)
    notice(s, "error", `Could not send the message: ${errorText(err)}`)
  })
}

const interrupt = (s: ChatSession) => {
  if (!s.running || s.stopping) {
    return
  }
  s.stopping = true
  setRunning(s, true)
  api.chatInterrupt(s.id).catch(() => {
    s.stopping = false
    setRunning(s, true)
  })
}

// Enter while not composing an IME character
const isSendKey = (e: KeyboardEvent) => e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229

// Wire the composer, stop button, jump button and scrolling
export const wireComposer = (s: ChatSession) => {
  const sync = () => {
    s.send.disabled = s.ended || s.input.value.trim() === ""
    autosize(s.input)
  }
  s.input.addEventListener("input", sync)
  s.input.addEventListener("keydown", (e) => {
    if (isSendKey(e)) {
      e.preventDefault()
      submit(s, sync)
    }
  })
  s.send.addEventListener("click", () => {
    submit(s, sync)
    s.input.focus()
  })
  s.stop.addEventListener("click", () => interrupt(s))
  s.root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && s.running && !e.isComposing) {
      e.preventDefault()
      interrupt(s)
    }
  })
  // Re-check pinning after a card opens or closes
  s.thread.addEventListener("click", () => {
    requestAnimationFrame(() => {
      s.pinned = atBottom(s)
      updateJump(s)
    })
  })
  s.jump.addEventListener("click", () => {
    toBottom(s)
    s.input.focus()
  })
  s.scroll.addEventListener(
    "scroll",
    () => {
      if (!s.scroll.clientHeight) {
        return
      }
      s.pinned = atBottom(s)
      s.savedTop = s.scroll.scrollTop
      updateJump(s)
    },
    { passive: true },
  )
}
