// Hex colours, OKLCH conversion and WCAG contrast.

import { Schema } from "effect"

export const HexColor = Schema.String.pipe(Schema.check(Schema.isPattern(/^#[0-9a-f]{6}$/)), Schema.brand("HexColor"))
export type HexColor = typeof HexColor.Type

// Gamma encoded sRGB channels in 0..1
interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

// Lightness 0..1, chroma 0..~0.37, hue in degrees
export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
}

// Normalised #rrggbb from #rgb or #rrggbb text, else null
export const parseHex = (text: string): HexColor | null => {
  const raw = text.trim().toLowerCase().replace(/^#/, "")
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${[...raw].map((c) => c + c).join("")}` as HexColor
  }
  return /^[0-9a-f]{6}$/.test(raw) ? (`#${raw}` as HexColor) : null
}

const channel = (hex: HexColor, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255

const toRgb = (hex: HexColor): Rgb => ({ r: channel(hex, 0), g: channel(hex, 1), b: channel(hex, 2) })

const byte = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0")

const toHex = ({ r, g, b }: Rgb) => `#${byte(r)}${byte(g)}${byte(b)}` as HexColor

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055)

const linear = ({ r, g, b }: Rgb): Rgb => ({ r: toLinear(r), g: toLinear(g), b: toLinear(b) })
const gamma = ({ r, g, b }: Rgb): Rgb => ({ r: toGamma(r), g: toGamma(g), b: toGamma(b) })

const linearFromOklch = ({ l, c, h }: Oklch): Rgb => {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    g: -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    b: -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  }
}

export const toOklch = (hex: HexColor): Oklch => {
  const { r, g, b } = linear(toRgb(hex))
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h }
}

const inGamut = ({ r, g, b }: Rgb) => [r, g, b].every((v) => v >= -1e-4 && v <= 1 + 1e-4)

// Nearest sRGB colour, lowering chroma until it fits
export const fromOklch = (lch: Oklch): HexColor => {
  const l = Math.min(1, Math.max(0, lch.l))
  if (inGamut(linearFromOklch({ ...lch, l }))) {
    return toHex(gamma(linearFromOklch({ ...lch, l })))
  }
  const fit = Array.from({ length: 24 }).reduce<{ lo: number; hi: number }>(
    ({ lo, hi }) => {
      const mid = (lo + hi) / 2
      return inGamut(linearFromOklch({ l, c: mid, h: lch.h })) ? { lo: mid, hi } : { lo, hi: mid }
    },
    { lo: 0, hi: lch.c },
  )
  return toHex(gamma(linearFromOklch({ l, c: fit.lo, h: lch.h })))
}

// WCAG relative luminance
export const luminance = (hex: HexColor) => {
  const { r, g, b } = linear(toRgb(hex))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast ratio, 1 to 21
export const contrast = (a: HexColor, b: HexColor) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

// Shortest angle between two hues, 0 to 180
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}
