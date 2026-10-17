// Random dark theme generated in OKLCH.

import { contrast, fromOklch, type HexColor, hueDistance } from "../../shared/theme/color.ts"
import { type Palette, paletteOf, type ThemeToken } from "../../shared/theme/palette.ts"

export type Rand = () => number

export interface RandomTheme {
  readonly name: string
  readonly palette: Palette
}

// Where each status hue sits so it stays recognisable
export const STATUS_HUES = { working: 255, needs: 82, done: 152, exited: 22 } as const

// Degrees the accent keeps from each status it could be mistaken for
export const ACCENT_CLEARANCE = { needs: 24, done: 34, exited: 24 } as const
type ClearedStatus = keyof typeof ACCENT_CLEARANCE
const CLEARED: ReadonlyArray<ClearedStatus> = ["needs", "done", "exited"]

// Minimum WCAG contrast against bg
export const MIN_CONTRAST = { text: 14, muted: 5.5, faint: 3, accent: 6, status: 5 } as const

// Lightness above bg and chroma multiple for each surface
const SURFACES: ReadonlyArray<readonly [ThemeToken, number, number]> = [
  ["bg", 0, 1],
  ["panel", 0.032, 1.15],
  ["panel-2", 0.068, 1.35],
  ["panel-3", 0.1, 1.55],
  ["line", 0.118, 1.65],
  ["line-strong", 0.17, 1.9],
  ["overlay", -0.042, 0.9],
  ["shadow", -0.1, 0.6],
]

// Accent offsets from the base hue
const ACCENT_OFFSETS = [0, 30, -30, 120, -120, 150, 180, 210]

const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [35, "red"],
  [65, "orange"],
  [100, "gold"],
  [130, "lime"],
  [165, "green"],
  [195, "teal"],
  [230, "cyan"],
  [275, "blue"],
  [300, "indigo"],
  [330, "violet"],
  [360, "magenta"],
]

const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo)

const pick = <T>(rand: Rand, items: ReadonlyArray<T>, fallback: T): T => items[Math.floor(rand() * items.length)] ?? fallback

const wrap = (hue: number) => ((hue % 360) + 360) % 360

export const hueName = (hue: number) => HUE_NAMES.find(([max]) => wrap(hue) < max)?.[1] ?? "red"

// Nearest hue outside every status clearance zone
const clearOfStatus = (hue: number, statusHues: Readonly<Record<ClearedStatus, number>>) => {
  const clear = (h: number) => CLEARED.every((s) => hueDistance(h, statusHues[s]) >= ACCENT_CLEARANCE[s])
  const offsets = Array.from({ length: 180 }, (_, i) => [i, -i]).flat()
  return wrap(hue + (offsets.find((d) => clear(hue + d)) ?? 0))
}

// Lightest needed, from l upward, to clear min contrast on bg
const readable = (l: number, c: number, h: number, bg: HexColor, min: number): HexColor => {
  const steps = Array.from({ length: 60 }, (_, i) => Math.min(1, l + i * 0.01))
  const lightness = steps.find((x) => contrast(fromOklch({ l: x, c, h }), bg) >= min) ?? 1
  return fromOklch({ l: lightness, c, h })
}

export const randomTheme = (rand: Rand = Math.random): RandomTheme => {
  const base = between(rand, 0, 360)
  const chroma = between(rand, 0.004, 0.022)
  const bgL = between(rand, 0.13, 0.175)
  const surfaces = new Map(
    SURFACES.map(([token, dl, dc]) => [token, fromOklch({ l: Math.max(0.02, bgL + dl), c: chroma * dc, h: base })] as const),
  )
  const bg = surfaces.get("bg") ?? fromOklch({ l: bgL, c: chroma, h: base })

  const statusHues = {
    needs: STATUS_HUES.needs + between(rand, -6, 6),
    done: STATUS_HUES.done + between(rand, -8, 8),
    exited: STATUS_HUES.exited + between(rand, -6, 6),
  }
  const accentHue = clearOfStatus(wrap(base + pick(rand, ACCENT_OFFSETS, 0)), statusHues)
  const accent = readable(between(rand, 0.7, 0.8), between(rand, 0.12, 0.18), accentHue, bg, MIN_CONTRAST.accent)
  const status = (l: number, c: number, h: number) => readable(l, c, h, bg, MIN_CONTRAST.status)
  const working =
    hueDistance(accentHue, STATUS_HUES.working) <= 50
      ? accent
      : status(between(rand, 0.72, 0.78), between(rand, 0.11, 0.14), STATUS_HUES.working + between(rand, -12, 12))

  const colors = new Map<ThemeToken, HexColor>([
    ...surfaces,
    ["text", readable(between(rand, 0.92, 0.95), Math.min(0.018, chroma * 0.9), base, bg, MIN_CONTRAST.text)],
    ["muted", readable(between(rand, 0.66, 0.71), Math.min(0.04, chroma * 1.6), base, bg, MIN_CONTRAST.muted)],
    ["faint", readable(between(rand, 0.49, 0.54), Math.min(0.045, chroma * 1.6), base, bg, MIN_CONTRAST.faint)],
    ["accent", accent],
    ["working", working],
    ["needs", status(between(rand, 0.82, 0.86), between(rand, 0.13, 0.16), statusHues.needs)],
    ["done", status(between(rand, 0.77, 0.81), between(rand, 0.13, 0.16), statusHues.done)],
    ["exited", status(between(rand, 0.66, 0.71), between(rand, 0.14, 0.17), statusHues.exited)],
  ])
  return {
    name: `Random ${hueName(accentHue)}`,
    palette: paletteOf((token) => colors.get(token) ?? bg),
  }
}
