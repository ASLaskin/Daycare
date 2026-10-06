// The whole renderer <-> main surface in one place.
//
// `Invoke` lists request/response channels. Each carries the Schema its payload
// is decoded with in main (the renderer is a web page, so its input is checked
// like any other), and `InvokeResult` says what comes back. `Send` channels are
// fire-and-forget, `Events` flow from main to the renderer.

import { Schema } from "effect"
import type { ChatEvent } from "./chat.ts"
import type { PowerStatus } from "./power.ts"
import { NewMaster, type SessionView } from "./session.ts"
import { type Settings, SettingsPatch } from "./settings.ts"
import { RestoreSkill, SetSkillPlugin, SetSkillState, type SkillsListing } from "./skills.ts"
import type { Usage } from "./usage.ts"

const Id = Schema.String
const None = Schema.Undefined

export const PermissionDecision = Schema.Struct({
  allow: Schema.Boolean,
  message: Schema.optionalKey(Schema.String),
  updatedInput: Schema.optionalKey(Schema.Unknown),
  updatedPermissions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})
export type PermissionDecision = typeof PermissionDecision.Type

export const Invoke = {
  "app:defaults": None,
  "settings:get": None,
  "settings:set": SettingsPatch,
  "dialog:pick-folder": None,
  "open:finder": Schema.String,
  "open:vscode": Schema.String,
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
  "chat:permission": Schema.Struct({ id: Id, requestId: Schema.String, decision: PermissionDecision }),
  "chat:history": Id,
} as const

export type InvokeChannel = keyof typeof Invoke
export type InvokePayload<C extends InvokeChannel> = (typeof Invoke)[C]["Type"]

export interface BuildInfo {
  readonly sourceDir: string
  readonly commit: string | null
  readonly builtAt: string | null
}

export interface UpdateResult {
  readonly ok: boolean
  readonly log: string
}

export interface InvokeResult {
  "app:defaults": { readonly cwd: string; readonly claude: string }
  "settings:get": Settings
  "settings:set": Settings
  "dialog:pick-folder": string | null
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

export const Send = {
  "pty:write": Schema.Struct({ id: Id, data: Schema.String }),
  "pty:resize": Schema.Struct({ id: Id, cols: Schema.Int, rows: Schema.Int }),
} as const

export type SendChannel = keyof typeof Send
export type SendPayload<C extends SendChannel> = (typeof Send)[C]["Type"]

export interface Events {
  "session:created": SessionView
  "session:update": SessionView
  "session:removed": { readonly id: string; readonly parentId: string | null }
  "session:begin-rename": { readonly id: string }
  "shortcut:close": undefined
  "pty:data": { readonly id: string; readonly data: string }
  "chat:event": { readonly id: string; readonly event: ChatEvent }
  "usage:update": Usage
  "power:update": PowerStatus
  "update:log": string
}

export type EventChannel = keyof Events

// What the preload exposes as `window.daycare`. Deliberately generic: the typed
// surface lives in the renderer's client, so adding a channel never touches the
// preload.
export interface Bridge {
  readonly invoke: <C extends InvokeChannel>(channel: C, payload: InvokePayload<C>) => Promise<InvokeResult[C]>
  readonly send: <C extends SendChannel>(channel: C, payload: SendPayload<C>) => void
  readonly on: <C extends EventChannel>(channel: C, listener: (payload: Events[C]) => void) => () => void
}
