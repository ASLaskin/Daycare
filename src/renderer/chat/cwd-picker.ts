// Folder button on a new chat, picking where it runs.

import type { SessionView } from "../../shared/session.ts"
import { addLocation } from "../add-location.ts"
import { api } from "../api.ts"
import { isPristine, relocateMaster } from "../session-actions.ts"
import type { ChatSession } from "./types.ts"

export const wireCwdPicker = (s: ChatSession, info: SessionView) => {
  const button = s.emptyEl?.querySelector<HTMLButtonElement>(".chat-empty-sub")
  if (!button) {
    return
  }
  if (info.role !== "master" || !isPristine(info)) {
    button.disabled = true
    return
  }
  button.title = "Change folder"
  button.onclick = async () => {
    const dir = await api.pickLocation(s.cwd)
    if (!dir) {
      return
    }
    // New folders join the saved locations, as from the toolbar
    await addLocation(dir)
    await relocateMaster(info.id, dir)
  }
}
