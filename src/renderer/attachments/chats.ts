import type { SessionView } from "../../shared/session.ts"
import { getActiveMaster } from "../focus.ts"
import { panes, workersOf } from "../state.ts"
import { aggregate } from "./aggregate.ts"
import { seenIn } from "./store.ts"

// Active master and its workers
export const sessionChats = (): ReadonlyArray<SessionView> => {
  const id = getActiveMaster()
  const master = id ? panes.get(id)?.info : undefined
  return master ? [master, ...workersOf(master.id)] : []
}

export const sessionAttachments = () =>
  aggregate(sessionChats().map((c) => ({ name: c.name || "Session", seen: seenIn(c.id) })))
