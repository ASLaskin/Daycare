// Coordinator records and choices as the renderer's types.

import type { LiveSession } from "../../shared/coordinator.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import type { SessionStatus, SessionView } from "../../shared/session.ts"

const ALLOW = ["allow", "accept"]
const ALWAYS = ["always", "acceptForSession"]
const REFUSE = ["deny", "decline", "cancel"]

// A creation not yet started is waiting for its first message
const status = (s: LiveSession): SessionStatus => {
  if (s.closed) {
    return "closed"
  }
  switch (s.state) {
    case "creating":
      return s.live ? "starting" : "idle"
    case "running":
      return "working"
    case "idle":
      return "done"
    case "interrupted":
      return "interrupted"
    case "incomplete":
      return "incomplete"
  }
}

export const view = (s: LiveSession): SessionView => ({
  id: s.id,
  name: s.name,
  icon: s.icon,
  role: s.role,
  parentId: s.parentId,
  status: status(s),
  activity: s.error ?? "",
  // Empty means the provider default
  model: s.model ?? "",
  provider: s.provider,
  permissionMode: s.permissionMode,
  // Launches on first message
  hadTurn: s.run > 0,
  cwd: s.cwd,
  task: null,
  createdAt: s.createdAt,
  finishedTurns: 0,
  context: 0,
})

// Offered choice matching the decision exactly
export const pick = (offered: ReadonlyArray<string>, decision: PermissionDecision): string | null => {
  if (decision.choice !== undefined) {
    return offered.includes(decision.choice) ? decision.choice : null
  }
  const always = decision.updatedPermissions && decision.updatedPermissions.length > 0
  const wanted = decision.allow ? (always ? [...ALWAYS, ...ALLOW] : ALLOW) : REFUSE
  return wanted.find((c) => offered.includes(c)) ?? null
}
