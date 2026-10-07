// IPC channels between main and renderer.

import { Schema } from "effect"
import type { ChatEvent } from "./chat.ts"
import { DirPath, type FilePath, RequestId, SessionId } from "./ids.ts"
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
})
export type PermissionDecision = typeof PermissionDecision.Type

export const Invoke = {
  "app:defaults": None,
  "settings:get": None,
  "settings:set": SettingsPatch,
  "dialog:pick-folder": None,
  "open:finder": DirPath,
  "open:vscode": DirPath,
  "update:info": None,
  "update:run": None,
  "usage:get": None,
  "usage:refresh": None,

  "session:list": None,
  "master:create": NewMaster,
  "session:rename": Schema.Struct({ id: Id, name: Schema.String }),
  "session:close": Id,
  "session:reopen": Id,
  "session:delete": Id,
  "session:menu": Id,

  "power:status": None,
  "power:restore": None,
  "power:dismiss-error": None,

  "skills:list": None,
  "skills:set": SetSkillState,
  "skills:plugin": SetSkillPlugin,
  "skills:restore": RestoreSkill,

  "chat:send": Schema.Struct({ id: Id, text: Schema.String }),
  "chat:interrupt": Id,
  "chat:permission": Schema.Struct({ id: Id, requestId: RequestId, decision: PermissionDecision }),
  "chat:history": Id,
} as const

export type InvokeChannel = keyof typeof Invoke
export type InvokePayload<C extends InvokeChannel> = (typeof Invoke)[C]["Type"]

export const BuildInfo = Schema.Struct({
  sourceDir: DirPath,
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
  "update:info": BuildInfo | null
  "update:run": UpdateResult
  "usage:get": Usage
  "usage:refresh": Usage

  "session:list": ReadonlyArray<SessionView>
  "master:create": SessionView
  "session:rename": void
  "session:close": void
  "session:reopen": void
  "session:delete": void
  "session:menu": void

  "power:status": PowerStatus
  "power:restore": PowerStatus
  "power:dismiss-error": PowerStatus

  "skills:list": SkillsListing
  "skills:set": SkillsListing
  "skills:plugin": SkillsListing
  "skills:restore": SkillsListing

  "chat:send": void
  "chat:interrupt": void
  "chat:permission": boolean
  "chat:history": ReadonlyArray<ChatEvent>
}

export interface Events {
  "session:created": SessionView
  "session:update": SessionView
  "session:removed": { readonly id: SessionId; readonly parentId: SessionId | null }
  "session:begin-rename": { readonly id: SessionId }
  "shortcut:close": undefined
  "chat:event": { readonly id: SessionId; readonly event: ChatEvent }
  "usage:update": Usage
  "power:update": PowerStatus
  "update:log": string
}

export type EventChannel = keyof Events

// Bridge exposed as window.daycare
export interface Bridge {
  readonly invoke: <C extends InvokeChannel>(channel: C, payload: InvokePayload<C>) => Promise<InvokeResult[C]>
  readonly on: <C extends EventChannel>(channel: C, listener: (payload: Events[C]) => void) => () => void
}
