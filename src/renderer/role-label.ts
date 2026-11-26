// Worker, Master, or Chat label for a session.

import type { SessionView } from "../shared/session.ts"

export const roleLabel = (info: SessionView) => {
  if (info.role === "worker") {
    return "Worker"
  }
  return info.masterMode ? "Master" : "Chat"
}
