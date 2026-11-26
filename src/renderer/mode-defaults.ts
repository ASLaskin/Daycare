// Default model and effort for master or plain chat sessions.

import { settings } from "./store.ts"

export const modeDefaults = (masterMode: boolean) => {
  const s = settings()
  return masterMode ? { model: s.masterModel, effort: s.masterEffort } : { model: s.chatModel, effort: s.chatEffort }
}
