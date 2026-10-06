import { stick } from "./scroll.ts"
import { settleThinking } from "./thinking.ts"
import type { ChatSession } from "./types.ts"

export const setRunning = (s: ChatSession, on: boolean) => {
  s.running = on
  if (!on) {
    s.stopping = false
  }
  s.root.classList.toggle("running", on)
  s.working.hidden = !on
  s.stop.hidden = !on
  s.stop.disabled = s.stopping
  const stopText = s.stop.querySelector(".chat-stop-text")
  if (stopText) {
    stopText.textContent = s.stopping ? "Stopping" : "Stop"
  }
  if (!on) {
    settleThinking(s)
  }
  stick(s)
}
