// Socket contract between the coordinator and its clients.

import { Schema } from "effect"
import { ChatEvent } from "./chat.ts"
import { DirPath, RequestId, SessionId } from "./ids.ts"
import { PermissionMode, Provider, SessionRole } from "./session.ts"

export const NativeId = Schema.String.pipe(Schema.brand("NativeId"))
export type NativeId = typeof NativeId.Type
export const asNativeId = (s: string) => s as NativeId

export const SessionState = Schema.Literals(["creating", "incomplete", "idle", "running", "interrupted"])
export type SessionState = typeof SessionState.Type

// One row of the coordinator's sessions table
export const StoredSession = Schema.Struct({
  id: SessionId,
  provider: Provider,
  nativeId: Schema.NullOr(NativeId),
  role: SessionRole,
  parentId: Schema.NullOr(SessionId),
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  cwd: DirPath,
  model: Schema.NullOr(Schema.String),
  permissionMode: PermissionMode,
  state: SessionState,
  closed: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
  // Provider launches so far; scopes streamed partials
  run: Schema.Number,
})
export type StoredSession = typeof StoredSession.Type

// Stored session plus whether its provider is running now
export const LiveSession = Schema.Struct({ ...StoredSession.fields, live: Schema.Boolean })
export type LiveSession = typeof LiveSession.Type

export const Approval = Schema.Struct({
  session: SessionId,
  request: RequestId,
  choices: Schema.Array(Schema.String),
  event: ChatEvent,
})
export type Approval = typeof Approval.Type

export const SessionHistory = Schema.Union([
  Schema.Struct({ evicted: Schema.Boolean, events: Schema.Array(ChatEvent) }),
  Schema.Struct({ error: Schema.String }),
])
export type SessionHistory = typeof SessionHistory.Type

export const Command = Schema.Union([
  Schema.Struct({
    method: Schema.Literal("create"),
    provider: Provider,
    cwd: DirPath,
    prompt: Schema.String,
    name: Schema.optionalKey(Schema.String),
    model: Schema.NullOr(Schema.String),
    permissionMode: PermissionMode,
  }),
  Schema.Struct({ method: Schema.Literal("send"), session: SessionId, text: Schema.String }),
  Schema.Struct({ method: Schema.Literal("interrupt"), session: SessionId }),
  Schema.Struct({
    method: Schema.Literal("answer"),
    session: SessionId,
    request: RequestId,
    choice: Schema.String,
    message: Schema.optionalKey(Schema.String),
    updatedInput: Schema.optionalKey(Schema.Json),
  }),
  // Close and reopen act on a master's workers too; reopen starts no agent
  Schema.Struct({ method: Schema.Literal("close"), session: SessionId }),
  Schema.Struct({ method: Schema.Literal("reopen"), session: SessionId }),
  Schema.Struct({ method: Schema.Literal("rename"), session: SessionId, name: Schema.String }),
  // Permanently deletes the session, a master's workers, and their history
  Schema.Struct({ method: Schema.Literal("remove"), session: SessionId }),
  // An orchestration tool call on behalf of a master; may stay pending while a wait blocks
  Schema.Struct({ method: Schema.Literal("tool"), master: SessionId, name: Schema.String, input: Schema.Json }),
])
export type Command = typeof Command.Type

export const Created = Schema.Struct({ session: SessionId })

// Taken by the coordinator; says nothing about provider delivery
export const Accepted = Schema.Struct({ accepted: Schema.Literal("coordinator") })

export const ClientMessage = Schema.Union([
  // subscribe: false for requests-only clients, which get ready instead of a snapshot
  Schema.Struct({ type: Schema.Literal("hello"), version: Schema.String, subscribe: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ type: Schema.Literal("request"), id: Schema.Number, command: Command }),
])
export type ClientMessage = typeof ClientMessage.Type

export const HubEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("session"), session: LiveSession }),
  Schema.Struct({ kind: Schema.Literal("chat"), session: SessionId, event: ChatEvent }),
  Schema.Struct({ kind: Schema.Literal("approval"), approval: Approval }),
  Schema.Struct({ kind: Schema.Literal("removed"), session: SessionId, parentId: Schema.NullOr(SessionId) }),
])
export type HubEvent = typeof HubEvent.Type

export const Snapshot = Schema.Struct({
  type: Schema.Literal("snapshot"),
  seq: Schema.Number,
  sessions: Schema.Array(LiveSession),
  unavailable: Schema.Array(Schema.String),
  history: Schema.Record(Schema.String, SessionHistory),
  approvals: Schema.Array(Approval),
})
export type Snapshot = typeof Snapshot.Type

export const ServerMessage = Schema.Union([
  Snapshot,
  Schema.Struct({ type: Schema.Literal("ready") }),
  Schema.Struct({ type: Schema.Literal("event"), seq: Schema.Number, event: HubEvent }),
  Schema.Struct({ type: Schema.Literal("response"), id: Schema.Number, result: Schema.Json }),
  Schema.Struct({ type: Schema.Literal("response"), id: Schema.Number, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal("version_mismatch"), coordinator: Schema.String, client: Schema.String }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
])
export type ServerMessage = typeof ServerMessage.Type
