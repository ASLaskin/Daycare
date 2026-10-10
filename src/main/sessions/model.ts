// In memory session record and its projections.

import { Option, Schema } from "effect"
import fs from "node:fs"
import { DEFAULT_ACCOUNT } from "../../shared/accounts.ts"
import type { AccountId, ClaudeSessionId, DirPath, FilePath, SessionId } from "../../shared/ids.ts"
import { isJsonObject, type Json } from "../../shared/json.ts"
import { type PermissionMode, SessionRecord, type SessionRole, type SessionStatus, type SessionView } from "../../shared/session.ts"

export interface Session {
  readonly id: SessionId
  readonly role: SessionRole
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
  // Closing from the app, so it stays listed
  closing: boolean
  // Account whose config dir the claude child uses
  accountId: AccountId
  // Account to resume on once the current child exits
  restartOn: AccountId | null
}

export interface CreateOptions {
  readonly role: SessionRole
  readonly cwd: DirPath
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly task?: string
  readonly name?: string | undefined
  readonly parentId?: SessionId
  readonly accountId?: AccountId
}

export const view = (s: Session): SessionView => ({
  id: s.id,
  name: s.name,
  icon: s.icon,
  role: s.role,
  parentId: s.parentId,
  status: s.status,
  activity: s.activity,
  model: s.model,
  provider: "claude",
  permissionMode: s.permissionMode,
  cwd: s.cwd,
  task: s.task,
  createdAt: s.createdAt,
  finishedTurns: s.finishedTurns,
  hadTurn: s.hadTurn,
  context: s.context,
  accountId: s.accountId,
})

export const record = (s: Session): SessionRecord => ({
  id: s.id,
  role: s.role,
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
  accountId: s.accountId,
})

const RECORD_DEFAULTS = {
  model: "",
  permissionMode: "default",
  icon: null,
  parentId: null,
  transcriptPath: null,
  hadTurn: false,
  closed: false,
  accountId: DEFAULT_ACCOUNT,
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
