// Theme tiles, each previewing its own palette.

import type { ThemeId } from "../../shared/ids.ts"
import { BUILTIN_THEMES } from "../../shared/theme/builtins.ts"
import { cssVar, type Palette, type ThemeToken } from "../../shared/theme/palette.ts"
import { type ActiveTheme, activeTheme, listThemes, type ThemeState } from "../../shared/theme/themes.ts"
import { el } from "../dom.ts"
import { choicePicker } from "../fields.ts"
import { paintPalette } from "./apply.ts"

const PREVIEW_SWATCHES: ReadonlyArray<ThemeToken> = ["accent", "working", "needs", "done", "exited"]

const sub = (t: ActiveTheme) => {
  if (t.kind === "draft") {
    return "Unsaved"
  }
  return BUILTIN_THEMES.find((b) => b.id === t.id)?.sub ?? "Custom"
}

// Miniature window: sidebar, pane, and accent and status swatches
const preview = (palette: Palette) => {
  const box = el("span", "theme-preview")
  paintPalette(box, palette)
  const pane = el("span", "tp-pane")
  pane.append(el("span", "tp-text"), el("span", "tp-muted"))
  const swatches = el("span", "tp-swatches")
  swatches.append(
    ...PREVIEW_SWATCHES.map((token) => {
      const swatch = el("span", "tp-swatch")
      swatch.style.background = `var(${cssVar(token)})`
      return swatch
    }),
  )
  pane.append(swatches)
  box.append(el("span", "tp-side"), pane)
  return box
}

export const renderThemePicker = (host: HTMLElement, s: ThemeState, onPick: (id: ThemeId) => void) => {
  const themes = listThemes(s)
  const palettes = new Map(themes.map((t) => [t.id, t.palette]))
  const items = themes.map((t) => ({ id: t.id, label: t.name, sub: sub(t) }))
  choicePicker(host, items, activeTheme(s).id, onPick, (b, it) => {
    const palette = palettes.get(it.id)
    if (palette) {
      b.append(preview(palette))
    }
  })
}
