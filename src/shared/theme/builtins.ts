// Built in dark themes.

import { Schema } from "effect"
import { asThemeId, type ThemeId } from "../ids.ts"
import { Palette } from "./palette.ts"

export interface BuiltinTheme {
  readonly id: ThemeId
  readonly name: string
  readonly sub: string
  readonly palette: Palette
}

const palette = Schema.decodeSync(Palette)

export const GRAPHITE: BuiltinTheme = {
  id: asThemeId("graphite"),
  name: "Graphite",
  sub: "Cool neutral grey, blue accent",
  palette: palette({
    bg: "#0b0c0e",
    panel: "#111316",
    "panel-2": "#181b1f",
    "panel-3": "#1f2328",
    line: "#23272d",
    "line-strong": "#2f343c",
    overlay: "#040507",
    shadow: "#000000",
    text: "#e9ebee",
    muted: "#8f96a0",
    faint: "#5d646e",
    accent: "#7aa2ff",
    working: "#7aa2ff",
    needs: "#f2b84b",
    done: "#5fd39a",
    exited: "#e5726b",
  }),
}

export const EMBER: BuiltinTheme = {
  id: asThemeId("ember"),
  name: "Ember",
  sub: "Warm brown charcoal, amber accent",
  palette: palette({
    bg: "#0f0b09",
    panel: "#17120f",
    "panel-2": "#201a15",
    "panel-3": "#29211c",
    line: "#2d2520",
    "line-strong": "#3c322a",
    overlay: "#060403",
    shadow: "#030100",
    text: "#f1eae0",
    muted: "#a79989",
    faint: "#74665a",
    accent: "#f7933c",
    working: "#74b4d9",
    needs: "#f1ca47",
    done: "#8ccc66",
    exited: "#e9615e",
  }),
}

export const TIDE: BuiltinTheme = {
  id: asThemeId("tide"),
  name: "Tide",
  sub: "Deep navy teal, cyan accent",
  palette: palette({
    bg: "#050d13",
    panel: "#09141b",
    "panel-2": "#0f1d25",
    "panel-3": "#16262e",
    line: "#1a2a32",
    "line-strong": "#253841",
    overlay: "#010509",
    shadow: "#000206",
    text: "#e3edf0",
    muted: "#88a2ab",
    faint: "#566d77",
    accent: "#2fd4ec",
    working: "#2fd4ec",
    needs: "#f9c04c",
    done: "#60db89",
    exited: "#ed737b",
  }),
}

export const ULTRAVIOLET: BuiltinTheme = {
  id: asThemeId("ultraviolet"),
  name: "Ultraviolet",
  sub: "Purple black, violet accent",
  palette: palette({
    bg: "#0d0a13",
    panel: "#14111c",
    "panel-2": "#1d1826",
    "panel-3": "#262030",
    line: "#2a2434",
    "line-strong": "#393044",
    overlay: "#050309",
    shadow: "#020005",
    text: "#eee9f2",
    muted: "#a297b1",
    faint: "#6f657f",
    accent: "#c97dfc",
    working: "#c97dfc",
    needs: "#febe4e",
    done: "#4bdba0",
    exited: "#f16779",
  }),
}

export const BUILTIN_THEMES: ReadonlyArray<BuiltinTheme> = [GRAPHITE, EMBER, TIDE, ULTRAVIOLET]
