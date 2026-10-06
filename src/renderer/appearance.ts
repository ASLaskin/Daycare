import { panes, scheduleFit } from "./state.ts"
import { settings } from "./store.ts"

export const MOTIONS = [
  { id: "off", label: "Off" },
  { id: "fast", label: "Fast" },
  { id: "normal", label: "Normal" },
  { id: "slow", label: "Slow" },
] as const
export const FONTS = [
  { id: "system", label: "System", sub: "SF Pro, what the rest of the Mac uses" },
  { id: "inter", label: "Inter", sub: "A touch more open, bundled with the app" },
] as const
export const MONOS = [
  { id: "system", label: "SF Mono", sub: "The Mac terminal default" },
  { id: "jetbrains", label: "JetBrains Mono", sub: "Taller x-height, bundled with the app" },
] as const

const MONO_STACK = {
  system: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  jetbrains: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
}

export const SIDEBAR_WIDTH = 264

export const monoFamily = () => MONO_STACK[settings().monoFont]

export const termFontSize = () => {
  const n = settings().termFontSize
  return n >= 9 && n <= 20 ? n : 12.5
}

export const applyAppearance = () => {
  const s = settings()
  const root = document.documentElement
  root.dataset["motion"] = s.motion
  root.dataset["font"] = s.font
  root.dataset["mono"] = s.monoFont
  const w = s.sidebarWidth
  root.style.setProperty("--sidebar-w", `${w >= 200 ? Math.min(460, w) : SIDEBAR_WIDTH}px`)
  const family = monoFamily()
  const size = termFontSize()
  panes.forEach((p) => {
    if (!p.term || (p.term.options.fontFamily === family && p.term.options.fontSize === size)) {
      return
    }
    p.term.options.fontFamily = family
    p.term.options.fontSize = size
    scheduleFit(p)
  })
}
