// App settings schema, defaults and merging.

import { Option, Schema } from "effect"
import { Account, DEFAULT_ACCOUNT } from "./accounts.ts"
import { AccountId, DirPath } from "./ids.ts"
import { IconPack } from "./icons.ts"
import { isJsonObject, type Json } from "./json.ts"
import { SAME_AS_MASTER } from "./models.ts"
import { PermissionMode, Provider } from "./session.ts"

export const Location = Schema.Struct({ label: Schema.String, path: DirPath })
export type Location = typeof Location.Type

export const KeepAwake = Schema.Literals(["off", "while-running", "always"])
export type KeepAwake = typeof KeepAwake.Type

export const AppIcon = Schema.Literals(["random", "block", "sleepybot", "house"])
export const Motion = Schema.Literals(["off", "fast", "normal", "slow"])
export const Font = Schema.Literals(["system", "inter"])
export const MonoFont = Schema.Literals(["system", "jetbrains"])
export const RailTab = Schema.Literals(["skills", "attachments"])
export type RailTab = typeof RailTab.Type
export const Layout = Schema.Literals(["stack", "side", "columns", "grid"])
export type Layout = typeof Layout.Type

export const Settings = Schema.Struct({
  askOnNew: Schema.Boolean,
  randomNames: Schema.Boolean,
  doneSounds: Schema.Boolean,
  showIcons: Schema.Boolean,
  iconPack: IconPack,
  showContext: Schema.Boolean,
  defaultLocation: Schema.Int,
  masterModel: Schema.String,
  workerModel: Schema.String,
  autoWorkerModel: Schema.Boolean,
  permissionMode: PermissionMode,
  oogaBooga: Schema.Boolean,
  // Coordinator only
  provider: Provider,
  keepAwake: KeepAwake,
  keepAwakeLidClosed: Schema.Boolean,
  appIcon: AppIcon,
  railOpen: Schema.Boolean,
  railTab: RailTab,
  contextScale: Schema.Finite,
  contextLimit: Schema.Finite,
  motion: Motion,
  font: Font,
  monoFont: MonoFont,
  layout: Layout,
  // Master share per layout preset, in percent
  splits: Schema.Record(Schema.String, Schema.Finite),
  sidebarWidth: Schema.Finite,
  sidebarCollapsed: Schema.Boolean,
  railWidth: Schema.Finite,
  zoomDblClick: Schema.Boolean,
  maxCols: Schema.Int,
  stageGap: Schema.Finite,
  locations: Schema.Array(Location),
  // Added accounts; Default is implicit
  accounts: Schema.Array(Account),
  activeAccount: AccountId,
})
export type Settings = typeof Settings.Type

// Defaults without machine specific locations
export const baseSettings: Omit<Settings, "locations"> = {
  askOnNew: false,
  randomNames: true,
  doneSounds: true,
  showIcons: true,
  iconPack: "pokemon",
  showContext: true,
  defaultLocation: 0,
  masterModel: "opus",
  workerModel: SAME_AS_MASTER.id,
  autoWorkerModel: false,
  permissionMode: "default",
  oogaBooga: false,
  provider: "claude",
  keepAwake: "while-running",
  keepAwakeLidClosed: false,
  appIcon: "random",
  railOpen: false,
  railTab: "skills",
  contextScale: 500000,
  contextLimit: 150000,
  motion: "normal",
  font: "system",
  monoFont: "system",
  layout: "stack",
  splits: {},
  sidebarWidth: 288,
  sidebarCollapsed: false,
  railWidth: 252,
  zoomDblClick: true,
  maxCols: 4,
  stageGap: 10,
  accounts: [],
  activeAccount: DEFAULT_ACCOUNT,
}

// Defaults overlaid with each decodable field of raw
export const mergeSettings = (defaults: Settings, raw: Json | undefined): Settings => {
  if (!isJsonObject(raw)) {
    return defaults
  }
  const input = raw
  const decoded = Object.entries(Settings.fields)
    .filter(([key]) => key in input)
    .flatMap(([key, schema]) => {
      const value = Schema.decodeUnknownOption(schema)(input[key])
      return Option.isSome(value) ? [[key, value.value] as const] : []
    })
  return { ...defaults, ...Object.fromEntries(decoded) } as Settings
}

// Partial settings update from the renderer
export const SettingsPatch = Schema.Record(Schema.String, Schema.Json)
