// Working, needs you, and all done state across open agents.

import type { SessionId } from "../shared/ids.ts"
import type { SessionRole, SessionStatus } from "../shared/session.ts"

export interface AgentState {
  readonly id: SessionId
  readonly role: SessionRole
  readonly status: SessionStatus
}

export type Activity =
  | { readonly kind: "needs-you"; readonly waiting: ReadonlyArray<SessionId> }
  | { readonly kind: "working" }
  | { readonly kind: "all-done" }
  | { readonly kind: "quiet" }

export interface Highlights {
  // Agents blocked on the user
  readonly attention: ReadonlyArray<SessionId>
  // Masters outlined once everything finished
  readonly finished: ReadonlyArray<SessionId>
}

// Waiting beats working; done needs at least one finished turn
export const deriveActivity = (agents: ReadonlyArray<AgentState>): Activity => {
  const waiting = agents.filter((a) => a.status === "needs_you").map((a) => a.id)
  if (waiting.length) {
    return { kind: "needs-you", waiting }
  }
  if (agents.some((a) => a.status === "working")) {
    return { kind: "working" }
  }
  if (agents.some((a) => a.status === "done")) {
    return { kind: "all-done" }
  }
  return { kind: "quiet" }
}

export const isUnlocked = (activity: Activity) => activity.kind === "working"

// Active master gets the done outline when it finished a turn
export const highlightsFor = (activity: Activity, activeMaster: AgentState | null): Highlights => {
  switch (activity.kind) {
    case "needs-you":
      return { attention: activity.waiting, finished: [] }
    case "all-done":
      return { attention: [], finished: activeMaster?.role === "master" && activeMaster.status === "done" ? [activeMaster.id] : [] }
    case "working":
    case "quiet":
      return { attention: [], finished: [] }
  }
}
