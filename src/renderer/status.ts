import type { SessionStatus } from "../shared/session.ts"

export const STATUS_LABEL: Record<SessionStatus, string> = {
  starting: "Starting",
  idle: "Ready",
  working: "Working",
  needs_you: "Needs you",
  done: "Done",
  exited: "Exited",
  interrupted: "Interrupted",
  incomplete: "Incomplete",
  closed: "Closed",
}
