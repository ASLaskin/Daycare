// Socket contract between the coordinator and its clients.

import { Schema } from "effect"
import { DesktopCatalog } from "./catalog.ts"
import { ChatEvent } from "./chat.ts"
import { AccountId, DirPath, FilePath, RequestId, SessionId } from "./ids.ts"
import { ChatImage } from "./images.ts"
import { LidClosed, PowerState } from "./power.ts"
import { PermissionMode, Provider, SessionRole } from "./session.ts"
import { KeepAwake } from "./settings.ts"

export const NativeId = Schema.String.pipe(Schema.brand("NativeId"))
export type NativeId = typeof NativeId.Type
export const asNativeId = (s: string) => s as NativeId

// Random per coordinator start; seq restarts with it
export const Epoch = Schema.String.pipe(Schema.brand("Epoch"))
export type Epoch = typeof Epoch.Type
export const asEpoch = (s: string) => s as Epoch

// Per history row; never reused within a session
export const Entry = Schema.Int
export type Entry = typeof Entry.Type

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
  effort: Schema.NullOr(Schema.String),
  permissionMode: PermissionMode,
  state: SessionState,
  closed: Schema.Boolean,
  // Worker set aside; stays closed until unarchived
  archived: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
  // Provider launch count; scopes streamed partials
  run: Schema.Number,
  accountId: AccountId,
  // Claude config dir; null is ~/.claude
  configDir: Schema.NullOr(DirPath),
})
export type StoredSession = typeof StoredSession.Type

// Stored session plus whether its provider is running now
export const LiveSession = Schema.Struct({ ...StoredSession.fields, live: Schema.Boolean })
export type LiveSession = typeof LiveSession.Type

// Subagent model settings applied when a master spawns a worker
export const WorkerModels = Schema.Struct({ workerModel: Schema.String, autoWorkerModel: Schema.Boolean })
export type WorkerModels = typeof WorkerModels.Type

// Subagent effort settings applied when a master spawns a worker
export const WorkerEfforts = Schema.Struct({ workerEffort: Schema.String, autoWorkerEffort: Schema.Boolean })
export type WorkerEfforts = typeof WorkerEfforts.Type

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

export const CreateCommand = Schema.Struct({
  method: Schema.Literal("create"),
  provider: Provider,
  cwd: DirPath,
  prompt: Schema.String,
  name: Schema.optionalKey(Schema.String),
  // Sprite chosen by the client
  icon: Schema.optionalKey(Schema.String),
  model: Schema.NullOr(Schema.String),
  effort: Schema.NullOr(Schema.String),
  permissionMode: PermissionMode,
  accountId: AccountId,
  configDir: Schema.NullOr(DirPath),
})
// Images go to the provider inline; files by path
export const SendCommand = Schema.Struct({
  method: Schema.Literal("send"),
  session: SessionId,
  text: Schema.String,
  images: Schema.Array(ChatImage),
  files: Schema.Array(FilePath),
})
export const InterruptCommand = Schema.Struct({ method: Schema.Literal("interrupt"), session: SessionId })
export const AnswerCommand = Schema.Struct({
  method: Schema.Literal("answer"),
  session: SessionId,
  request: RequestId,
  choice: Schema.String,
  message: Schema.optionalKey(Schema.String),
  updatedInput: Schema.optionalKey(Schema.Json),
})
// Close and reopen include a master's workers
export const CloseCommand = Schema.Struct({ method: Schema.Literal("close"), session: SessionId })
export const ReopenCommand = Schema.Struct({ method: Schema.Literal("reopen"), session: SessionId })
// Workers only; archived ones skip a master's reopen
export const ArchiveCommand = Schema.Struct({ method: Schema.Literal("archive"), session: SessionId })
export const UnarchiveCommand = Schema.Struct({ method: Schema.Literal("unarchive"), session: SessionId })
export const RenameCommand = Schema.Struct({ method: Schema.Literal("rename"), session: SessionId, name: Schema.String })
// Permanently deletes the session, a master's workers, and their history
export const RemoveCommand = Schema.Struct({ method: Schema.Literal("remove"), session: SessionId })
// Stops a Claude session and carries its transcript to another account
export const MoveCommand = Schema.Struct({ method: Schema.Literal("move"), session: SessionId, accountId: AccountId, configDir: Schema.NullOr(DirPath) })
// Switches a Claude session's model, live when running
export const ModelCommand = Schema.Struct({ method: Schema.Literal("model"), session: SessionId, model: Schema.String })
// Switches a Claude session's effort, live when running
export const EffortCommand = Schema.Struct({ method: Schema.Literal("effort"), session: SessionId, effort: Schema.String })
// Absent oogaBooga keeps the stored value
export const ConfigureCommand = Schema.Struct({
  method: Schema.Literal("configure"),
  workerModels: WorkerModels,
  workerEfforts: WorkerEfforts,
  oogaBooga: Schema.optionalKey(Schema.Boolean),
})
// Keep awake mode; initial applies only when none stored
export const PowerCommand = Schema.Struct({ method: Schema.Literal("power"), mode: KeepAwake, initial: Schema.optionalKey(Schema.Boolean) })
// Desktop's lid closed state; cleared when that connection closes
export const LidCommand = Schema.Struct({ method: Schema.Literal("lid"), lid: Schema.NullOr(LidClosed) })
// Orchestration tool call for a master; may block
export const ToolCommand = Schema.Struct({ method: Schema.Literal("tool"), master: SessionId, name: Schema.String, input: Schema.Json })
// Desktop settings phones start sessions from; persisted
export const CatalogCommand = Schema.Struct({ method: Schema.Literal("catalog"), catalog: DesktopCatalog })
// Phone gateway status as PairingInfo
export const PairingCommand = Schema.Struct({ method: Schema.Literal("pairing") })
// New token; closes every phone connection
export const PairingRotateCommand = Schema.Struct({ method: Schema.Literal("pairing-rotate") })
// Creates gateway.json and starts the gateway
export const PairingSetupCommand = Schema.Struct({ method: Schema.Literal("pairing-setup") })

export const Command = Schema.Union([
  CreateCommand,
  SendCommand,
  InterruptCommand,
  AnswerCommand,
  CloseCommand,
  ReopenCommand,
  ArchiveCommand,
  UnarchiveCommand,
  RenameCommand,
  RemoveCommand,
  MoveCommand,
  ModelCommand,
  EffortCommand,
  ConfigureCommand,
  PowerCommand,
  LidCommand,
  ToolCommand,
  CatalogCommand,
  PairingCommand,
  PairingRotateCommand,
  PairingSetupCommand,
])
export type Command = typeof Command.Type

export const Created = Schema.Struct({ session: SessionId })

// Accepted, not yet delivered; entry of the user event
export const Accepted = Schema.Struct({ accepted: Schema.Literal("coordinator"), entry: Entry })
export type Accepted = typeof Accepted.Type

export const MediaKind = Schema.Literals(["image", "video", "audio"])
export type MediaKind = typeof MediaKind.Type

// Media file a session's events mention, checked on disk
export const MediaItem = Schema.Struct({
  // Real path, symlinks resolved
  path: FilePath,
  name: Schema.String,
  mimeType: Schema.String,
  kind: MediaKind,
  size: Schema.Int,
  // Epoch ms
  modifiedAt: Schema.Number,
  // Newest mentioning entry; null when only under cwd
  entry: Schema.NullOr(Entry),
})
export type MediaItem = typeof MediaItem.Type

export const ClientMessage = Schema.Union([
  // false: requests-only, gets ready instead of a snapshot
  Schema.Struct({ type: Schema.Literal("hello"), version: Schema.String, subscribe: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ type: Schema.Literal("request"), id: Schema.Number, command: Command }),
])
export type ClientMessage = typeof ClientMessage.Type

export const HubEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("session"), session: LiveSession }),
  Schema.Struct({ kind: Schema.Literal("chat"), session: SessionId, entry: Entry, event: ChatEvent }),
  Schema.Struct({ kind: Schema.Literal("approval"), approval: Approval }),
  Schema.Struct({ kind: Schema.Literal("removed"), session: SessionId, parentId: Schema.NullOr(SessionId) }),
  Schema.Struct({ kind: Schema.Literal("power"), power: PowerState }),
  // Media files the session newly mentions that exist on disk
  Schema.Struct({ kind: Schema.Literal("media"), session: SessionId, items: Schema.Array(MediaItem) }),
  Schema.Struct({ kind: Schema.Literal("catalog"), catalog: DesktopCatalog }),
])
export type HubEvent = typeof HubEvent.Type

export const Snapshot = Schema.Struct({
  type: Schema.Literal("snapshot"),
  epoch: Epoch,
  seq: Schema.Number,
  sessions: Schema.Array(LiveSession),
  unavailable: Schema.Array(Schema.String),
  history: Schema.Record(Schema.String, SessionHistory),
  approvals: Schema.Array(Approval),
  power: PowerState,
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
