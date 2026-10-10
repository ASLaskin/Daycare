import type { AccountId, RequestId, SessionId, SkillId } from "../shared/ids.ts"
import type { Bridge, EventChannel, Events, InvokeChannel, InvokePayload, InvokeResult } from "../shared/ipc.ts"
import type { PermissionDecision } from "../shared/ipc.ts"
import type { NewMaster } from "../shared/session.ts"
import type { Settings } from "../shared/settings.ts"
import type { SkillState } from "../shared/skills.ts"

declare global {
  interface Window {
    readonly daycare: Bridge
  }
}

const bridge = window.daycare

const call =
  <C extends InvokeChannel>(channel: C) =>
  (payload: InvokePayload<C>): Promise<InvokeResult[C]> =>
    bridge.invoke(channel, payload)

const ask =
  <C extends InvokeChannel>(channel: C) =>
  (): Promise<InvokeResult[C]> =>
    bridge.invoke(channel, undefined as InvokePayload<C>)

const on =
  <C extends EventChannel>(channel: C) =>
  (listener: (payload: Events[C]) => void): (() => void) =>
    bridge.on(channel, listener)

export const api = {
  defaults: ask("app:defaults"),
  getSettings: ask("settings:get"),
  setSettings: (patch: Partial<Settings>) => bridge.invoke("settings:set", patch),
  pickFolder: ask("dialog:pick-folder"),
  openFinder: call("open:finder"),
  openVSCode: call("open:vscode"),
  openUrl: call("open:url"),
  updateInfo: ask("update:info"),
  runUpdate: call("update:run"),
  onUpdateLog: on("update:log"),
  getUsage: ask("usage:get"),
  refreshUsage: ask("usage:refresh"),
  onUsage: on("usage:update"),

  listAccounts: ask("accounts:list"),
  addAccount: call("accounts:add"),
  removeAccount: call("accounts:remove"),
  switchAccount: call("accounts:switch"),
  loginAccount: call("accounts:login"),
  loginCode: (id: AccountId, code: string) => bridge.invoke("accounts:login-code", { id, code }),
  cancelLogin: call("accounts:login-cancel"),
  onLogin: on("account:login"),

  listSessions: ask("session:list"),
  createMaster: (options: NewMaster) => bridge.invoke("master:create", options),
  rename: (id: SessionId, name: string) => bridge.invoke("session:rename", { id, name }),
  closeSession: call("session:close"),
  reopenSession: call("session:reopen"),
  deleteSession: call("session:delete"),
  sessionMenu: call("session:menu"),
  onCreated: on("session:created"),
  onUpdate: on("session:update"),
  onRemoved: on("session:removed"),
  onBeginRename: on("session:begin-rename"),
  onCloseShortcut: on("shortcut:close"),

  powerStatus: ask("power:status"),
  powerRestore: ask("power:restore"),
  powerDismissError: ask("power:dismiss-error"),
  onPower: on("power:update"),

  listSkills: ask("skills:list"),
  setSkillState: (id: SkillId, state: SkillState) => bridge.invoke("skills:set", { id, state }),
  setSkillPlugin: (id: SkillId, enabled: boolean) => bridge.invoke("skills:plugin", { id, enabled }),
  restoreSkill: (id: SkillId) => bridge.invoke("skills:restore", { id }),

  chatSend: (id: SessionId, text: string) => bridge.invoke("chat:send", { id, text }),
  chatInterrupt: call("chat:interrupt"),
  chatPermission: (id: SessionId, requestId: RequestId, decision: PermissionDecision) =>
    bridge.invoke("chat:permission", { id, requestId, decision }),
  chatHistory: call("chat:history"),
  onChatEvent: on("chat:event"),
}
