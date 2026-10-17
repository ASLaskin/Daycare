// Saved theme presets, the unsaved draft, and which palette is active.

import { Option, Schema, SchemaTransformation } from "effect"
import { asThemeId, ThemeId } from "../ids.ts"
import type { Json, JsonObject } from "../json.ts"
import { BUILTIN_THEMES, type BuiltinTheme, GRAPHITE } from "./builtins.ts"
import { parseHex } from "./color.ts"
import { Palette, paletteOf } from "./palette.ts"

// Missing or invalid tokens fall back to Graphite
const LenientPalette = Schema.Record(Schema.String, Schema.Json).pipe(
  Schema.decodeTo(
    Palette,
    SchemaTransformation.transform<typeof Palette.Encoded, JsonObject>({
      decode: (raw) =>
        paletteOf((token) => {
          const value = raw[token]
          return (typeof value === "string" && parseHex(value)) || GRAPHITE.palette[token]
        }),
      encode: (palette) => palette,
    }),
  ),
)

export const CustomTheme = Schema.Struct({ id: ThemeId, name: Schema.String, palette: LenientPalette })
export type CustomTheme = typeof CustomTheme.Type

// Unsaved edits, forked from base
export const ThemeDraft = Schema.Struct({ name: Schema.String, base: ThemeId, palette: LenientPalette })
export type ThemeDraft = typeof ThemeDraft.Type

const decodeCustom = Schema.decodeUnknownOption(CustomTheme)

// Drops presets that do not decode instead of all of them
export const CustomThemes = Schema.Array(Schema.Json).pipe(
  Schema.decodeTo(
    Schema.Array(CustomTheme),
    SchemaTransformation.transform<ReadonlyArray<typeof CustomTheme.Encoded>, ReadonlyArray<Json>>({
      decode: (items) => items.flatMap((item) => Option.toArray(decodeCustom(item))),
      encode: (themes) => themes,
    }),
  ),
)

export const DRAFT_THEME = asThemeId("draft")

export interface ThemeState {
  readonly theme: ThemeId
  readonly customThemes: ReadonlyArray<CustomTheme>
  readonly themeDraft: ThemeDraft | null
}

export interface ActiveTheme {
  readonly kind: "builtin" | "custom" | "draft"
  readonly id: ThemeId
  readonly name: string
  readonly palette: Palette
}

const builtinEntry = (t: BuiltinTheme): ActiveTheme => ({ kind: "builtin", id: t.id, name: t.name, palette: t.palette })

// Built ins, then saved presets, then the draft
export const listThemes = (s: ThemeState): ReadonlyArray<ActiveTheme> => [
  ...BUILTIN_THEMES.map(builtinEntry),
  ...s.customThemes.map((t): ActiveTheme => ({ kind: "custom", ...t })),
  ...(s.themeDraft ? [{ kind: "draft", id: DRAFT_THEME, name: s.themeDraft.name, palette: s.themeDraft.palette } as const] : []),
]

// Selected theme, Graphite when the id is unknown
export const activeTheme = (s: ThemeState): ActiveTheme =>
  listThemes(s).find((t) => t.id === s.theme) ?? builtinEntry(GRAPHITE)
