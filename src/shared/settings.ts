// App settings schema, defaults and merging.

import { Option, Schema } from "effect"
import { DirPath } from "./ids.ts"
import { isJsonObject, type Json } from "./json.ts"
import { PermissionMode } from "./session.ts"

export const Location = Schema.Struct({ label: Schema.String, path: DirPath })
export type Location = typeof Location.Type

export const KeepAwake = Schema.Literals(["off", "while-running", "always"])
export type KeepAwake = typeof KeepAwake.Type

export const AppIcon = Schema.Literals(["random", "block", "sleepybot", "house"])
export const Motion = Schema.Literals(["off", "fast", "normal", "slow"])
export const Font = Schema.Literals(["system", "inter"])
export const MonoFont = Schema.Literals(["system", "jetbrains"])
export const Layout = Schema.Literals(["stack", "side", "columns", "grid"])
export type Layout = typeof Layout.Type

export const Settings = Schema.Struct({
  askOnNew: Schema.Boolean,
  randomNames: Schema.Boolean,
  doneSounds: Schema.Boolean,
  showIcons: Schema.Boolean,
  showContext: Schema.Boolean,
  defaultLocation: Schema.Int,
  model: Schema.String,
  permissionMode: PermissionMode,
  keepAwake: KeepAwake,
  keepAwakeLidClosed: Schema.Boolean,
  appIcon: AppIcon,
  skillRailOpen: Schema.Boolean,
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
})
export type Settings = typeof Settings.Type

// Defaults without machine specific locations
export const baseSettings: Omit<Settings, "locations"> = {
  askOnNew: false,
  randomNames: true,
  doneSounds: true,
  showIcons: true,
  showContext: true,
  defaultLocation: 0,
  model: "opus",
  permissionMode: "default",
  keepAwake: "while-running",
  keepAwakeLidClosed: false,
  appIcon: "random",
  skillRailOpen: false,
  contextScale: 500000,
  contextLimit: 150000,
  motion: "normal",
  font: "system",
  monoFont: "system",
  layout: "stack",
  splits: {},
  sidebarWidth: 264,
  sidebarCollapsed: false,
  railWidth: 252,
  zoomDblClick: true,
  maxCols: 4,
  stageGap: 10,
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
