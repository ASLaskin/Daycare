// Session model shared by main and renderer.

import { Schema } from "effect"

export const SessionRole = Schema.Literals(["master", "worker"])
export type SessionRole = typeof SessionRole.Type

// Terminal is the TUI; chat is headless stream-json.
export const SessionKind = Schema.Literals(["terminal", "chat"])
export type SessionKind = typeof SessionKind.Type

export const SessionStatus = Schema.Literals(["starting", "idle", "working", "needs_you", "done", "exited", "closed"])
export type SessionStatus = typeof SessionStatus.Type

export const PermissionMode = Schema.Literals(["default", "acceptEdits", "bypassPermissions", "plan"])
export type PermissionMode = typeof PermissionMode.Type

// Produced by main, so a plain type.
export interface SessionView {
  readonly id: string
  readonly name: string
  readonly icon: string | null
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly parentId: string | null
  readonly status: SessionStatus
  readonly activity: string
  readonly model: string
  readonly cwd: string
  readonly task: string | null
  readonly createdAt: number
  readonly finishedTurns: number
  readonly context: number
}

// Read from disk, so decoded.
export const SessionRecord = Schema.Struct({
  id: Schema.String,
  role: SessionRole,
  kind: SessionKind,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  cwd: Schema.String,
  model: Schema.String,
  permissionMode: PermissionMode,
  parentId: Schema.NullOr(Schema.String),
  claudeSessionId: Schema.String,
  transcriptPath: Schema.NullOr(Schema.String),
  hadTurn: Schema.Boolean,
  createdAt: Schema.Number,
  closed: Schema.Boolean,
})
export type SessionRecord = typeof SessionRecord.Type

// Empty model means Claude's default.
export const NewMaster = Schema.Struct({
  task: Schema.String,
  kind: SessionKind,
  cwd: Schema.String,
  model: Schema.String,
  permissionMode: PermissionMode,
  name: Schema.optionalKey(Schema.String),
})
export type NewMaster = typeof NewMaster.Type
