// Chat or Master switch, shown until the chat is used.

import type { SessionView } from "../../shared/session.ts"
import { isPristine, switchMasterMode } from "../session-actions.ts"
import type { ChatSession } from "./types.ts"

const HINT = {
  chat: "A plain Claude session in this folder.",
  master: "Splits the work across workers you can see and talk to.",
}

export const wireModePicker = (s: ChatSession, info: SessionView) => {
  if (info.role !== "master" || !isPristine(info)) {
    s.mode.hidden = true
    return
  }
  const track = s.mode.querySelector<HTMLElement>(".mode-switch")
  const hint = s.mode.querySelector<HTMLElement>(".mode-hint")
  const [chat, master] = [...s.mode.querySelectorAll<HTMLButtonElement>(".mode-option")]
  if (!track || !hint || !chat || !master) {
    return
  }
  const paint = (isMaster: boolean) => {
    track.dataset["mode"] = isMaster ? "master" : "chat"
    hint.textContent = isMaster ? HINT.master : HINT.chat
    chat.setAttribute("role", "radio")
    master.setAttribute("role", "radio")
    chat.setAttribute("aria-checked", String(!isMaster))
    master.setAttribute("aria-checked", String(isMaster))
  }
  // Slides at once; the session is then replaced in that mode
  const pick = (isMaster: boolean) => {
    if (isMaster === info.masterMode) {
      return
    }
    paint(isMaster)
    switchMasterMode(info.id, isMaster)
  }
  paint(info.masterMode)
  chat.onclick = () => pick(false)
  master.onclick = () => pick(true)
  track.onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      pick(e.key === "ArrowRight")
    }
  }
}

// Reads the old thumb mid-slide; the returned step continues it on the new pane once that shows
export const continueSlide = (from: ChatSession, to: ChatSession) => {
  const was = from.mode.querySelector<HTMLElement>(".mode-thumb")
  const thumb = to.mode.querySelector<HTMLElement>(".mode-thumb")
  if (!was || !thumb || from.mode.hidden || to.mode.hidden) {
    return () => {}
  }
  const { transform, backgroundColor } = getComputedStyle(was)
  return () => {
    thumb.style.transition = "none"
    thumb.style.transform = transform
    thumb.style.backgroundColor = backgroundColor
    void thumb.offsetWidth
    thumb.style.removeProperty("transition")
    thumb.style.removeProperty("transform")
    thumb.style.removeProperty("background-color")
  }
}
