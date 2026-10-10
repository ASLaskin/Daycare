// One line summary of a master's workers.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { workersOf } from "./state.ts"

export const doneCount = (workers: ReadonlyArray<SessionView>) =>
  workers.filter((w) => w.status === "done" || w.status === "exited").length

const count = (workers: ReadonlyArray<SessionView>, status: SessionView["status"]) => workers.filter((w) => w.status === status).length

export const workerSummary = (masterId: SessionId) => {
  const workers = workersOf(masterId)
  const extra = [
    [count(workers, "needs_you"), "need you"],
    [count(workers, "interrupted"), "interrupted"],
    [count(workers, "incomplete"), "incomplete"],
  ] as const
  const head = workers.length ? `${doneCount(workers)} of ${workers.length} workers done` : "No workers yet"
  return [head, ...extra.flatMap(([n, label]) => (n ? [`${n} ${label}`] : []))].join(", ")
}
