// One line summary of a master's workers.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { workersOf } from "./state.ts"

export const doneCount = (workers: ReadonlyArray<SessionView>) =>
  workers.filter((w) => w.status === "done" || w.status === "exited").length

export const workerSummary = (masterId: SessionId) => {
  const workers = workersOf(masterId)
  const needs = workers.filter((w) => w.status === "needs_you").length
  const parts = [workers.length ? `${doneCount(workers)} of ${workers.length} workers done` : "No workers yet"]
  return [...parts, ...(needs ? [`${needs} need you`] : [])].join(", ")
}
