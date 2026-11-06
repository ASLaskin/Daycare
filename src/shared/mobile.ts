// Gateway contract between the coordinator and the phone app.

import { Schema } from "effect"
import { Catalog } from "./catalog.ts"
import { ChatEvent } from "./chat.ts"
import {
  AnswerCommand,
  Approval,
  ArchiveCommand,
  CloseCommand,
  ConfigureCommand,
  EffortCommand,
  Entry,
  Epoch,
  InterruptCommand,
  LiveSession,
  MediaItem,
  ModelCommand,
  RemoveCommand,
  RenameCommand,
  ReopenCommand,
  UnarchiveCommand,
} from "./coordinator.ts"
import { AccountId, DirPath, FilePath, RequestId, SessionId } from "./ids.ts"
import { Base64 } from "./images.ts"
import { PowerState } from "./power.ts"
import { PermissionMode, Provider } from "./session.ts"

export { Catalog, CatalogAccount, Choice, DesktopCatalog, phoneCatalog } from "./catalog.ts"
export { asEpoch, Entry, Epoch, MediaItem } from "./coordinator.ts"

// Bumped on any breaking wire change
export const PROTOCOL_VERSION = 1

export const PairingToken = Schema.String.pipe(Schema.brand("PairingToken"))
export type PairingToken = typeof PairingToken.Type

// Client minted UUID; replays return the first result
export const RequestKey = Schema.String.pipe(Schema.brand("RequestKey"))
export type RequestKey = typeof RequestKey.Type

// Stable per install, minted by the phone
export const DeviceId = Schema.String.pipe(Schema.brand("DeviceId"))
export type DeviceId = typeof DeviceId.Type

// Hex APNs device, push to start or activity token
export const ApnsToken = Schema.String.pipe(Schema.brand("ApnsToken"))
export type ApnsToken = typeof ApnsToken.Type

export const ActivityId = Schema.String.pipe(Schema.brand("ActivityId"))
export type ActivityId = typeof ActivityId.Type

export const asPairingToken = (s: string) => s as PairingToken
export const asRequestKey = (s: string) => s as RequestKey
export const asDeviceId = (s: string) => s as DeviceId
export const asApnsToken = (s: string) => s as ApnsToken
export const asActivityId = (s: string) => s as ActivityId

// History page size without a limit
export const DEFAULT_PAGE = 100
// Largest history page a client may ask for
export const MAX_PAGE = 200
// Largest decoded upload in one frame
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Session row plus a list preview, no transcript
export const MobileSession = Schema.Struct({
  ...LiveSession.fields,
  // Newest history entry, null when empty
  lastEntry: Schema.NullOr(Entry),
  // Epoch ms of the newest history entry
  lastEventAt: Schema.NullOr(Schema.Number),
  // Start of the newest assistant text
  preview: Schema.NullOr(Schema.String),
})
export type MobileSession = typeof MobileSession.Type

export const PushKind = Schema.Literals(["worker-done", "master-done", "approval", "battery-low"])
export type PushKind = typeof PushKind.Type

export const ApnsEnvironment = Schema.Literals(["development", "production"])
export type ApnsEnvironment = typeof ApnsEnvironment.Type

// Chat events for these sessions only; replaces the previous set
export const Watch = Schema.Struct({
  sessions: Schema.Array(SessionId),
  // False drops text-delta; the final text event still arrives
  deltas: Schema.Boolean,
})
export type Watch = typeof Watch.Type

export const Resume = Schema.Struct({ epoch: Epoch, seq: Schema.Int })
export type Resume = typeof Resume.Type

export const WatchCommand = Schema.Struct({ method: Schema.Literal("watch"), ...Watch.fields })

// Newest page without cursors; before and after are exclusive
export const HistoryCommand = Schema.Struct({
  method: Schema.Literal("history"),
  session: SessionId,
  before: Schema.optionalKey(Entry),
  after: Schema.optionalKey(Entry),
  limit: Schema.optionalKey(Schema.Int),
})

// Name, sprite and config dir are filled in by the coordinator
export const MobileCreateCommand = Schema.Struct({
  method: Schema.Literal("create"),
  provider: Provider,
  cwd: DirPath,
  prompt: Schema.String,
  name: Schema.optionalKey(Schema.String),
  model: Schema.NullOr(Schema.String),
  effort: Schema.NullOr(Schema.String),
  permissionMode: PermissionMode,
  // Catalog's active account when absent
  accountId: Schema.optionalKey(AccountId),
  // Paths from upload, sent as file references
  files: Schema.Array(FilePath),
})

export const MobileSendCommand = Schema.Struct({
  method: Schema.Literal("send"),
  session: SessionId,
  text: Schema.String,
  files: Schema.Array(FilePath),
})

// Config dir comes from the catalog
export const MobileMoveCommand = Schema.Struct({ method: Schema.Literal("move"), session: SessionId, accountId: AccountId })

// Saves a file under the coordinator's attachments folder
export const UploadCommand = Schema.Struct({ method: Schema.Literal("upload"), name: Schema.String, data: Base64 })

// Phones only keep awake or allow sleep
export const PhoneKeepAwake = Schema.Literals(["off", "always"])
export type PhoneKeepAwake = typeof PhoneKeepAwake.Type

export const PowerCommand = Schema.Struct({ method: Schema.Literal("power"), mode: PhoneKeepAwake })

// Media files the session's events mention, newest first
export const MediaCommand = Schema.Struct({ method: Schema.Literal("media"), session: SessionId })

// Upserts this hello's device; sent after every welcome
export const RegisterCommand = Schema.Struct({
  method: Schema.Literal("register"),
  apnsToken: ApnsToken,
  environment: ApnsEnvironment,
  // Live Activity push to start token, iOS 17.2 and later
  pushToStart: Schema.NullOr(ApnsToken),
  kinds: Schema.Array(PushKind),
})

export const UnregisterCommand = Schema.Struct({ method: Schema.Literal("unregister") })

// Update token of a running Live Activity
export const ActivityCommand = Schema.Struct({ method: Schema.Literal("activity"), activity: ActivityId, token: ApnsToken })

export const ActivityEndedCommand = Schema.Struct({ method: Schema.Literal("activity-ended"), activity: ActivityId })

export const MobileCommand = Schema.Union([
  WatchCommand,
  HistoryCommand,
  MobileCreateCommand,
  MobileSendCommand,
  UploadCommand,
  InterruptCommand,
  AnswerCommand,
  CloseCommand,
  ReopenCommand,
  ArchiveCommand,
  UnarchiveCommand,
  RenameCommand,
  RemoveCommand,
  MobileMoveCommand,
  ModelCommand,
  EffortCommand,
  ConfigureCommand,
  PowerCommand,
  MediaCommand,
  RegisterCommand,
  UnregisterCommand,
  ActivityCommand,
  ActivityEndedCommand,
])
export type MobileCommand = typeof MobileCommand.Type

export const MobileClientMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("hello"),
    protocol: Schema.Int,
    // App build, for logs only
    app: Schema.String,
    token: PairingToken,
    device: DeviceId,
    resume: Schema.optionalKey(Resume),
    watch: Schema.optionalKey(Watch),
  }),
  Schema.Struct({
    type: Schema.Literal("request"),
    id: Schema.Int,
    // Required for anything the outbox retries
    key: Schema.optionalKey(RequestKey),
    command: MobileCommand,
  }),
])
export type MobileClientMessage = typeof MobileClientMessage.Type

export const HistoryRow = Schema.Struct({ entry: Entry, event: ChatEvent })
export type HistoryRow = typeof HistoryRow.Type

// Oldest first
export const HistoryPage = Schema.Struct({
  session: SessionId,
  rows: Schema.Array(HistoryRow),
  // Rows exist before the first returned one
  hasOlder: Schema.Boolean,
  // Rows exist after the last returned one
  hasNewer: Schema.Boolean,
  // Older rows were discarded by the retention limit
  evicted: Schema.Boolean,
})
export type HistoryPage = typeof HistoryPage.Type

export const CreateResult = Schema.Struct({ session: SessionId })
export type CreateResult = typeof CreateResult.Type

// Entry of the recorded user event
export const SendResult = Schema.Struct({ accepted: Schema.Literal("coordinator"), entry: Entry })
export type SendResult = typeof SendResult.Type

export const UploadResult = Schema.Struct({ path: FilePath })
export type UploadResult = typeof UploadResult.Type

export const MediaList = Schema.Struct({ session: SessionId, items: Schema.Array(MediaItem) })
export type MediaList = typeof MediaList.Type

// HTTPS path serving one media file, Range requests supported
export const mediaUrlPath = (session: SessionId, path: FilePath) => `/media/${encodeURIComponent(session)}?path=${encodeURIComponent(path)}`

export const MobileEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("session"), session: MobileSession }),
  Schema.Struct({ kind: Schema.Literal("removed"), session: SessionId, parentId: Schema.NullOr(SessionId) }),
  Schema.Struct({ kind: Schema.Literal("approval"), approval: Approval }),
  // Sent for every session, watched or not
  Schema.Struct({
    kind: Schema.Literal("approval-resolved"),
    session: SessionId,
    request: RequestId,
    allowed: Schema.Boolean,
    cancelled: Schema.Boolean,
  }),
  // Watched sessions only
  Schema.Struct({ kind: Schema.Literal("chat"), session: SessionId, entry: Entry, event: ChatEvent }),
  Schema.Struct({ kind: Schema.Literal("power"), power: PowerState }),
  Schema.Struct({ kind: Schema.Literal("catalog"), catalog: Catalog }),
  // New media files for a session, watched or not
  Schema.Struct({ kind: Schema.Literal("media"), session: SessionId, items: Schema.Array(MediaItem) }),
])
export type MobileEvent = typeof MobileEvent.Type

// unavailable: retry later; rejected: the hub refused, do not retry
export const ErrorCode = Schema.Literals(["bad_request", "unauthorized", "rejected", "unavailable", "too_large", "internal"])
export type ErrorCode = typeof ErrorCode.Type

export const GatewayError = Schema.Struct({ code: ErrorCode, message: Schema.String })
export type GatewayError = typeof GatewayError.Type

export const MobileSnapshot = Schema.Struct({
  type: Schema.Literal("snapshot"),
  epoch: Epoch,
  seq: Schema.Int,
  sessions: Schema.Array(MobileSession),
  approvals: Schema.Array(Approval),
  power: PowerState,
  // Null until a desktop has connected once
  catalog: Schema.NullOr(Catalog),
  unavailable: Schema.Array(Schema.String),
})
export type MobileSnapshot = typeof MobileSnapshot.Type

export const MobileServerMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("welcome"),
    protocol: Schema.Int,
    // Coordinator package version, for display
    coordinator: Schema.String,
    epoch: Epoch,
    // Replayed events follow when true, a snapshot when false
    resumed: Schema.Boolean,
  }),
  MobileSnapshot,
  Schema.Struct({ type: Schema.Literal("event"), seq: Schema.Int, event: MobileEvent }),
  Schema.Struct({
    type: Schema.Literal("response"),
    id: Schema.Int,
    result: Schema.Json,
    // Result stored from an earlier request with the same key
    replayed: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literal("response"), id: Schema.Int, error: GatewayError }),
  Schema.Struct({ type: Schema.Literal("protocol_mismatch"), server: Schema.Int, client: Schema.Int }),
  // Not tied to a request; fatal ones are followed by a close
  Schema.Struct({ type: Schema.Literal("error"), error: GatewayError }),
])
export type MobileServerMessage = typeof MobileServerMessage.Type

// WebSocket close codes
export const CloseCode = {
  badHello: 4400,
  unauthorized: 4401,
  replaced: 4409,
  tooLarge: 4413,
  protocolMismatch: 4426,
  stalled: 4408,
  stopping: 4503,
} as const

// Custom "daycare" key of every alert push
export const PushData = Schema.Struct({
  kind: PushKind,
  session: Schema.NullOr(SessionId),
  request: Schema.NullOr(RequestId),
})
export type PushData = typeof PushData.Type

export const ActivityWorker = Schema.Struct({
  id: SessionId,
  name: Schema.String,
  // Master's name, null for a running master
  master: Schema.NullOr(Schema.String),
  // Epoch seconds the current turn started
  since: Schema.Number,
})
export type ActivityWorker = typeof ActivityWorker.Type

// Live Activity content-state; mirrored by the Swift ContentState
export const ActivityState = Schema.Struct({
  // At most 4, newest first
  running: Schema.Array(ActivityWorker),
  runningCount: Schema.Int,
  approvals: Schema.Int,
  batteryPercent: Schema.NullOr(Schema.Int),
  charging: Schema.Boolean,
  keepAwake: Schema.Boolean,
  // Epoch seconds
  updatedAt: Schema.Number,
})
export type ActivityState = typeof ActivityState.Type

// Live Activity static attributes, set at start
export const ActivityAttributes = Schema.Struct({ host: Schema.String })
export type ActivityAttributes = typeof ActivityAttributes.Type

// Desktop Settings view of the gateway
export const PairingInfo = Schema.Struct({
  listening: Schema.Boolean,
  // MagicDNS name, without the trailing dot
  host: Schema.NullOr(Schema.String),
  port: Schema.Int,
  token: PairingToken,
  // QR payload: daycare://pair?v=&host=&port=&token=
  url: Schema.NullOr(Schema.String),
  certExpiresAt: Schema.NullOr(Schema.Number),
  // APNs settings missing from gateway.json
  apnsMissing: Schema.Array(Schema.String),
  error: Schema.NullOr(Schema.String),
})
export type PairingInfo = typeof PairingInfo.Type

// Socket pairing result; null until "Set up phone"
export const PairingStatus = Schema.NullOr(PairingInfo)
export type PairingStatus = typeof PairingStatus.Type

export const pairingUrl = (host: string, port: number, token: PairingToken) =>
  `daycare://pair?v=${PROTOCOL_VERSION}&host=${encodeURIComponent(host)}&port=${port}&token=${encodeURIComponent(token)}`
