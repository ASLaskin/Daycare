// IPC channels between main and renderer.

import { Schema } from "effect"
import { type Account, type AccountStatus, LoginCode, type LoginProgress } from "./accounts.ts"
import { ResolveRequest, type ResolvedPath } from "./attachments.ts"
import type { ChatEvent } from "./chat.ts"
import { AccountId, DirPath, type FilePath, RequestId, SessionId } from "./ids.ts"
import type { PowerStatus } from "./power.ts"
import { NewMaster, type SessionView } from "./session.ts"
import { type Settings, SettingsPatch } from "./settings.ts"
import { RestoreSkill, SetSkillPlugin, SetSkillState, type SkillsListing } from "./skills.ts"
import type { Usage } from "./usage.ts"

const Id = SessionId
const None = Schema.Undefined

export const PermissionDecision = Schema.Struct({
  allow: Schema.Boolean,
  message: Schema.optionalKey(Schema.String),
  updatedInput: Schema.optionalKey(Schema.Json),
  updatedPermissions: Schema.optionalKey(Schema.Array(Schema.Json)),
  // An exact offered choice, picked from the request's own answers
  choice: Schema.optionalKey(Schema.String),
})
export type PermissionDecision = typeof PermissionDecision.Type

export const Invoke = {
  "app:defaults": None,
  "settings:get": None,
  "settings:set": SettingsPatch,
  "dialog:pick-folder": None,
  "open:finder": DirPath,
  "open:vscode": DirPath,
  "open:url": Schema.String,
  "update:info": None,
  "update:run": Schema.String,
  "usage:get": None,
  "usage:refresh": None,

  "accounts:list": None,
  "accounts:add": Schema.String,
  "accounts:remove": AccountId,
  "accounts:switch": AccountId,
  "accounts:login": AccountId,
  "accounts:login-code": LoginCode,
  "accounts:login-cancel": AccountId,

  "session:list": None,
  "master:create": NewMaster,
  "session:rename": Schema.Struct({ id: Id, name: Schema.String }),
  "session:close": Id,
  "session:reopen": Id,
  "session:delete": Id,
  "session:menu": Id,
  "coordinator:restart": None,

  "power:status": None,
  "power:restore": None,
  "power:dismiss-error": None,

  "skills:list": None,
  "skills:set": SetSkillState,
  "skills:plugin": SetSkillPlugin,
  "skills:restore": RestoreSkill,

  "attachment:resolve": ResolveRequest,
  "attachment:open-url": Schema.String,
  "attachment:open": Schema.String,
  "attachment:reveal": Schema.String,

  "chat:send": Schema.Struct({ id: Id, text: Schema.String }),
  "chat:interrupt": Id,
  "chat:model": Schema.Struct({ id: Id, model: Schema.String }),
  "chat:permission": Schema.Struct({ id: Id, requestId: RequestId, decision: PermissionDecision }),
  "chat:history": Id,
} as const

export type InvokeChannel = keyof typeof Invoke
export type InvokePayload<C extends InvokeChannel> = (typeof Invoke)[C]["Type"]

export const BuildInfo = Schema.Struct({
  sourceDir: DirPath,
  branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  commit: Schema.NullOr(Schema.String),
  builtAt: Schema.NullOr(Schema.String),
})
export type BuildInfo = typeof BuildInfo.Type

export interface UpdateResult {
  readonly ok: boolean
  readonly log: string
}

export interface InvokeResult {
  "app:defaults": { readonly cwd: DirPath; readonly claude: FilePath }
  "settings:get": Settings
  "settings:set": Settings
  "dialog:pick-folder": DirPath | null
  "open:finder": void
  "open:vscode": void
  "open:url": void
  "update:info": BuildInfo | null
  "update:run": UpdateResult
  "usage:get": Usage
  "usage:refresh": Usage

  "accounts:list": ReadonlyArray<AccountStatus>
  "accounts:add": Account
  "accounts:remove": Settings
  "accounts:switch": Settings
  "accounts:login": void
  "accounts:login-code": void
  "accounts:login-cancel": void

  "session:list": ReadonlyArray<SessionView>
  "master:create": SessionView
  "session:rename": void
  "session:close": void
  "session:reopen": void
  "session:delete": void
  "session:menu": void
  "coordinator:restart": void

  "power:status": PowerStatus
  "power:restore": PowerStatus
  "power:dismiss-error": PowerStatus

  "skills:list": SkillsListing
  "skills:set": SkillsListing
  "skills:plugin": SkillsListing
  "skills:restore": SkillsListing

  "attachment:resolve": ReadonlyArray<ResolvedPath>
  "attachment:open-url": void
  "attachment:open": void
  "attachment:reveal": void

  "chat:send": void
  "chat:interrupt": void
  "chat:model": void
  "chat:permission": boolean
  "chat:history": ReadonlyArray<ChatEvent>
}

export type CoordinatorStatus =
  | { readonly state: "connecting" }
  | { readonly state: "connected" }
  | { readonly state: "mismatch"; readonly coordinator: string; readonly app: string }
  | { readonly state: "unavailable"; readonly message: string }

export interface Events {
  "coordinator:status": CoordinatorStatus
  // Authoritative history replacing everything a pane has drawn
  "chat:reset": { readonly id: SessionId; readonly events: ReadonlyArray<ChatEvent> }
  "session:created": SessionView
  "session:update": SessionView
  "session:removed": { readonly id: SessionId; readonly parentId: SessionId | null }
  "session:begin-rename": { readonly id: SessionId }
  "shortcut:close": undefined
  "chat:event": { readonly id: SessionId; readonly event: ChatEvent }
  "usage:update": Usage
  "account:login": LoginProgress
  "power:update": PowerStatus
  "update:log": string
}

export type EventChannel = keyof Events

// Bridge exposed as window.daycare
export interface Bridge {
  readonly invoke: <C extends InvokeChannel>(channel: C, payload: InvokePayload<C>) => Promise<InvokeResult[C]>
  readonly on: <C extends EventChannel>(channel: C, listener: (payload: Events[C]) => void) => () => void
}
