// Master or plain chat switcher, shown until the chat is used.

import type { SessionView } from "../../shared/session.ts"
import { fillModels } from "../model-options.ts"
import { isPristine, switchMasterMode } from "../session-actions.ts"
import type { ChatSession } from "./types.ts"

const CHOICES = [
  { id: "chat", label: "Chat" },
  { id: "master", label: "Master" },
]

export const wireModePicker = (s: ChatSession, info: SessionView) => {
  if (info.role !== "master" || !isPristine(info)) {
    s.mode.hidden = true
    return
  }
  fillModels(s.mode, CHOICES)
  s.mode.value = info.masterMode ? "master" : "chat"
  s.mode.title = "Master splits work across workers. Chat is a plain session."
  s.mode.addEventListener("change", () => {
    switchMasterMode(info.id, s.mode.value === "master")
  })
}
