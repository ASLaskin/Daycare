// Theme colours as CSS variables.

import { type Palette, paletteVars } from "../../shared/theme/palette.ts"
import { activeTheme, type ThemeState } from "../../shared/theme/themes.ts"

export const paintPalette = (node: HTMLElement, palette: Palette) =>
  paletteVars(palette).forEach(([name, value]) => node.style.setProperty(name, value))

// Shows a palette live before it is saved
export const previewPalette = (palette: Palette) => paintPalette(document.documentElement, palette)

export const applyTheme = (s: ThemeState) => {
  const theme = activeTheme(s)
  paintPalette(document.documentElement, theme.palette)
  document.documentElement.dataset["theme"] = theme.id
}
