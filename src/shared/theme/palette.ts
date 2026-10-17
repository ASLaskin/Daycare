// Theme colour tokens and their CSS variables.

import { Schema } from "effect"
import { HexColor } from "./color.ts"

export const THEME_TOKENS = [
  "bg",
  "panel",
  "panel-2",
  "panel-3",
  "line",
  "line-strong",
  "overlay",
  "shadow",
  "text",
  "muted",
  "faint",
  "accent",
  "working",
  "needs",
  "done",
  "exited",
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]

export const Palette = Schema.Record(Schema.Literals(THEME_TOKENS), HexColor)
export type Palette = typeof Palette.Type

export const cssVar = (token: ThemeToken) => `--${token}`

// Select arrow drawn in a colour, as a CSS image
export const chevronImage = (color: HexColor) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%23${color.slice(1)}' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

// CSS custom properties for a palette, plus images drawn from it
export const paletteVars = (palette: Palette): ReadonlyArray<readonly [string, string]> => [
  ...THEME_TOKENS.map((token) => [cssVar(token), palette[token]] as const),
  ["--chevron", chevronImage(palette.muted)],
]

// Palette built token by token
export const paletteOf = (color: (token: ThemeToken) => HexColor): Palette =>
  Object.fromEntries(THEME_TOKENS.map((token) => [token, color(token)])) as Palette
