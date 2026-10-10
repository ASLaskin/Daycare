import type { ChatImage } from "../../shared/images.ts"
import { api } from "../api.ts"
import { toast } from "../toast.ts"
import { wireAttachInput } from "./attach-input.ts"
import { renderAttachments, takeAttachments } from "./attachments.ts"
import { setRunning } from "./running.ts"
import { atBottom, toBottom, updateJump } from "./scroll.ts"
import { errorText } from "./turn.ts"
import type { ChatSession } from "./types.ts"

const COMPOSER_MAX_PX = 168

export const autosize = (input: HTMLTextAreaElement) => {
  input.style.height = "auto"
  input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_PX)}px`
  input.style.overflowY = input.scrollHeight > COMPOSER_MAX_PX ? "auto" : "hidden"
}

const isEmpty = (s: ChatSession) => s.input.value.trim() === "" && !s.attachments.length

// Put an unsent message back when the composer is still empty
const restoreDraft = (s: ChatSession, text: string, images: ReadonlyArray<ChatImage>, sync: () => void) => {
  if (!isEmpty(s)) {
    return
  }
  s.input.value = text
  s.attachments.push(...images)
  renderAttachments(s)
  sync()
}

const submit = (s: ChatSession, sync: () => void) => {
  const text = s.input.value.trim()
  if (isEmpty(s) || s.ended) {
    return
  }
  const images = takeAttachments(s)
  s.input.value = ""
  sync()
  setRunning(s, true)
  s.pinned = true
  api.chatSend(s.id, text, images).catch((err: unknown) => {
    setRunning(s, false)
    restoreDraft(s, text, images, sync)
    toast(`Could not send the message: ${errorText(err)}`)
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
    s.send.disabled = s.ended || isEmpty(s)
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
  wireAttachInput(s)
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
