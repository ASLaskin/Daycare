// Session model shared by main and renderer.

import { Schema } from "effect"
import { ClaudeSessionId, DirPath, FilePath, SessionId } from "./ids.ts"

export const SessionRole = Schema.Literals(["master", "worker"])
export type SessionRole = typeof SessionRole.Type

// Terminal TUI or headless stream-json chat
export const SessionKind = Schema.Literals(["terminal", "chat"])
export type SessionKind = typeof SessionKind.Type

export const SessionStatus = Schema.Literals(["starting", "idle", "working", "needs_you", "done", "exited", "closed"])
export type SessionStatus = typeof SessionStatus.Type

export const PermissionMode = Schema.Literals(["default", "acceptEdits", "bypassPermissions", "plan"])
export type PermissionMode = typeof PermissionMode.Type

// Session as the renderer sees it
export interface SessionView {
  readonly id: SessionId
  readonly name: string
  readonly icon: string | null
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly parentId: SessionId | null
  readonly status: SessionStatus
  readonly activity: string
  readonly model: string
  readonly cwd: DirPath
  readonly task: string | null
  readonly createdAt: number
  readonly finishedTurns: number
  readonly context: number
}

// One persisted entry of sessions.json
export const SessionRecord = Schema.Struct({
  id: SessionId,
  role: SessionRole,
  kind: SessionKind,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  cwd: DirPath,
  model: Schema.String,
  permissionMode: PermissionMode,
  parentId: Schema.NullOr(SessionId),
  claudeSessionId: ClaudeSessionId,
  transcriptPath: Schema.NullOr(FilePath),
  hadTurn: Schema.Boolean,
  createdAt: Schema.Number,
  closed: Schema.Boolean,
})
export type SessionRecord = typeof SessionRecord.Type

// New master request; empty model means Claude's default
export const NewMaster = Schema.Struct({
  task: Schema.String,
  kind: SessionKind,
  cwd: DirPath,
  model: Schema.String,
  permissionMode: PermissionMode,
  name: Schema.optionalKey(Schema.String),
})
export type NewMaster = typeof NewMaster.Type
