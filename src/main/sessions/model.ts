// In memory session record and its projections.

import { Option, Schema } from "effect"
import fs from "node:fs"
import type { ClaudeSessionId, DirPath, FilePath, SessionId } from "../../shared/ids.ts"
import { isJsonObject, type Json } from "../../shared/json.ts"
import { type PermissionMode, type SessionKind, SessionRecord, type SessionRole, type SessionStatus, type SessionView } from "../../shared/session.ts"
import type { PtyProcess } from "./Pty.ts"

export interface Session {
  readonly id: SessionId
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly parentId: SessionId | null
  readonly cwd: DirPath
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly createdAt: number
  readonly icon: string | null
  name: string
  task: string | null
  status: SessionStatus
  activity: string
  transcriptPath: FilePath | null
  claudeSessionId: ClaudeSessionId
  lastMessage: string
  finishedTurns: number
  hadTurn: boolean
  context: number
  // Terminal PTY, or the shell left after claude exits
  proc: PtyProcess | null
  shell: boolean
  // Closing from the app, so it stays listed
  closing: boolean
  cols: number
  rows: number
}

export interface CreateOptions {
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly cwd: DirPath
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly task?: string
  readonly name?: string | undefined
  readonly parentId?: SessionId
}

export const view = (s: Session): SessionView => ({
  id: s.id,
  name: s.name,
  icon: s.icon,
  role: s.role,
  kind: s.kind,
  parentId: s.parentId,
  status: s.status,
  activity: s.activity,
  model: s.model,
  cwd: s.cwd,
  task: s.task,
  createdAt: s.createdAt,
  finishedTurns: s.finishedTurns,
  context: s.context,
})

export const record = (s: Session): SessionRecord => ({
  id: s.id,
  role: s.role,
  kind: s.kind,
  name: s.name,
  icon: s.icon,
  cwd: s.cwd,
  model: s.model,
  permissionMode: s.permissionMode,
  parentId: s.parentId,
  claudeSessionId: s.claudeSessionId,
  transcriptPath: s.transcriptPath,
  hadTurn: s.hadTurn,
  createdAt: s.createdAt,
  closed: s.status === "closed" || s.closing,
})

const RECORD_DEFAULTS = {
  kind: "terminal",
  model: "",
  permissionMode: "default",
  icon: null,
  parentId: null,
  transcriptPath: null,
  hadTurn: false,
  closed: false,
}

// Decode saved records, filling fields older versions lacked
export const decodeRecords = (raw: Json | null): Array<SessionRecord> => {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter(isJsonObject)
    .flatMap((r) => Option.toArray(Schema.decodeUnknownOption(SessionRecord)({ ...RECORD_DEFAULTS, ...r })))
}

export const isSettled = (s: Session) => s.status !== "working" && s.status !== "starting"

// Transcript exists on disk
export const canResume = (s: Session) => !!s.transcriptPath && fs.existsSync(s.transcriptPath)
