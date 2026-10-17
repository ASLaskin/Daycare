import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { contrast, hueDistance, luminance, toOklch } from "../src/shared/theme/color.ts"
import { Palette, type ThemeToken } from "../src/shared/theme/palette.ts"
import { ACCENT_CLEARANCE, hueName, MIN_CONTRAST, randomTheme, STATUS_HUES } from "../src/renderer/theme/random.ts"
import { seeded } from "./fixtures/seeded.ts"

const LADDER: ReadonlyArray<ThemeToken> = ["bg", "panel", "panel-2", "panel-3", "line", "line-strong"]
const themes = Array.from({ length: 400 }, (_, i) => randomTheme(seeded(i + 1)))
const hue = (p: Palette, t: ThemeToken) => toOklch(p[t]).h

describe("randomTheme", () => {
  test("is deterministic for a given source of randomness", () => {
    expect(randomTheme(seeded(7))).toEqual(randomTheme(seeded(7)))
    expect(randomTheme(seeded(7))).not.toEqual(randomTheme(seeded(8)))
  })

  test("every palette decodes", () => {
    themes.forEach((t) => expect(Option.isSome(Schema.decodeUnknownOption(Palette)(t.palette))).toBe(true))
  })

  test("surfaces are dark and step up in lightness", () => {
    themes.forEach(({ palette: p }) => {
      expect(luminance(p.bg)).toBeLessThan(0.015)
      const lums = LADDER.map((t) => luminance(p[t]))
      expect(lums).toEqual([...lums].sort((a, b) => a - b))
      expect(luminance(p.overlay)).toBeLessThanOrEqual(luminance(p.bg))
      expect(luminance(p.shadow)).toBeLessThanOrEqual(luminance(p.overlay))
    })
  })

  test("text, muted, faint and accent clear their contrast floors", () => {
    themes.forEach(({ palette: p }) => {
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.text)
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.muted)
      expect(contrast(p.faint, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.faint)
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.accent)
      expect(luminance(p.text)).toBeGreaterThan(luminance(p.muted))
      expect(luminance(p.muted)).toBeGreaterThan(luminance(p.faint))
    })
  })

  test("status colours stay recognisable and apart", () => {
    themes.forEach(({ palette: p }) => {
      expect(hueDistance(hue(p, "needs"), STATUS_HUES.needs)).toBeLessThanOrEqual(12)
      expect(hueDistance(hue(p, "done"), STATUS_HUES.done)).toBeLessThanOrEqual(14)
      expect(hueDistance(hue(p, "exited"), STATUS_HUES.exited)).toBeLessThanOrEqual(12)
      expect(hueDistance(hue(p, "working"), STATUS_HUES.working)).toBeLessThanOrEqual(55)
      const statuses = (["working", "needs", "done", "exited"] as const).map((t) => hue(p, t))
      statuses.forEach((a, i) => statuses.slice(i + 1).forEach((b) => expect(hueDistance(a, b)).toBeGreaterThanOrEqual(40)))
      ;(["working", "needs", "done", "exited"] as const).forEach((t) => {
        expect(contrast(p[t], p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.status)
      })
    })
  })

  test("accent keeps clear of needs, done and exited", () => {
    themes.forEach(({ palette: p }) => {
      ;(["needs", "done", "exited"] as const).forEach((t) => {
        expect(hueDistance(hue(p, "accent"), hue(p, t))).toBeGreaterThanOrEqual(ACCENT_CLEARANCE[t] - 6)
      })
    })
  })

  test("names come from the accent hue", () => {
    expect(hueName(250)).toBe("blue")
    expect(hueName(-10)).toBe("magenta")
    themes.forEach((t) => expect(t.name).toMatch(/^Random [a-z]+$/))
  })
})
