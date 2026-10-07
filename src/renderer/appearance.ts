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
  { id: "system", label: "SF Mono", sub: "The Mac system monospace" },
  { id: "jetbrains", label: "JetBrains Mono", sub: "Taller x-height, bundled with the app" },
] as const

export const SIDEBAR_WIDTH = 264

export const applyAppearance = () => {
  const s = settings()
  const root = document.documentElement
  root.dataset["motion"] = s.motion
  root.dataset["font"] = s.font
  root.dataset["mono"] = s.monoFont
  const w = s.sidebarWidth
  root.style.setProperty("--sidebar-w", `${w >= 200 ? Math.min(460, w) : SIDEBAR_WIDTH}px`)
}
