// App settings. The file on disk is edited by hand sometimes and outlives app
// versions, so it is decoded one field at a time: a bad or unknown field falls
// back to its default instead of throwing the whole file away.

import { Option, Schema } from "effect"
import { PermissionMode, SessionKind } from "./session.ts"

export const Location = Schema.Struct({ label: Schema.String, path: Schema.String })
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
  showIcons: Schema.Boolean,
  showContext: Schema.Boolean,
  defaultLocation: Schema.Int,
  model: Schema.String,
  permissionMode: PermissionMode,
  sessionKind: SessionKind,
  keepAwake: KeepAwake,
  keepAwakeLidClosed: Schema.Boolean,
  appIcon: AppIcon,
  skillRailOpen: Schema.Boolean,
  contextScale: Schema.Finite,
  contextLimit: Schema.Finite,
  motion: Motion,
  font: Font,
  monoFont: MonoFont,
  termFontSize: Schema.Finite,
  layout: Layout,
  // Preset -> master share in percent, set by dragging the split.
  splits: Schema.Record(Schema.String, Schema.Finite),
  sidebarWidth: Schema.Finite,
  railWidth: Schema.Finite,
  zoomDblClick: Schema.Boolean,
  maxCols: Schema.Int,
  stageGap: Schema.Finite,
  locations: Schema.Array(Location),
})
export type Settings = typeof Settings.Type

// Defaults that do not depend on the machine. Locations are filled in by main.
export const baseSettings: Omit<Settings, "locations"> = {
  askOnNew: false,
  randomNames: true,
  showIcons: true,
  showContext: true,
  defaultLocation: 0,
  model: "opus",
  permissionMode: "default",
  sessionKind: "terminal",
  keepAwake: "while-running",
  keepAwakeLidClosed: false,
  appIcon: "random",
  skillRailOpen: false,
  contextScale: 500000,
  contextLimit: 150000,
  motion: "normal",
  font: "system",
  monoFont: "system",
  termFontSize: 12.5,
  layout: "stack",
  splits: {},
  sidebarWidth: 264,
  railWidth: 252,
  zoomDblClick: true,
  maxCols: 4,
  stageGap: 10,
}

// Keeps every field of `raw` that decodes, on top of `defaults`.
export const mergeSettings = (defaults: Settings, raw: unknown): Settings => {
  if (typeof raw !== "object" || raw === null) return defaults
  const input = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...defaults }
  for (const [key, schema] of Object.entries(Settings.fields)) {
    if (!(key in input)) continue
    const decoded = Schema.decodeUnknownOption(schema as Schema.Codec<unknown>)(input[key])
    if (Option.isSome(decoded)) out[key] = decoded.value
  }
  return out as Settings
}

// A partial update from the renderer. Same lenient rule, so a stray field is
// dropped rather than failing the save.
export const SettingsPatch = Schema.Record(Schema.String, Schema.Unknown)
