import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { BUILTIN_THEMES, EMBER, GRAPHITE } from "../src/shared/theme/builtins.ts"
import { contrast, fromOklch, type HexColor, hueDistance, luminance, parseHex, toOklch } from "../src/shared/theme/color.ts"
import { chevronImage, paletteVars, THEME_TOKENS, type ThemeToken } from "../src/shared/theme/palette.ts"
import { MIN_CONTRAST, STATUS_HUES } from "../src/renderer/theme/random.ts"
import { TOKEN_GROUPS } from "../src/renderer/theme/token-groups.ts"

const hex = (text: string) => parseHex(text) as HexColor

const LADDER: ReadonlyArray<ThemeToken> = ["bg", "panel", "panel-2", "panel-3", "line", "line-strong"]

describe("colour", () => {
  test("parses short and long hex, rejects the rest", () => {
    expect(parseHex("#ABC")).toBe(hex("#aabbcc"))
    expect(parseHex(" 7aa2ff ")).toBe(hex("#7aa2ff"))
    expect(parseHex("#7aa2f")).toBeNull()
    expect(parseHex("blue")).toBeNull()
  })

  test("OKLCH round trips sRGB colours", () => {
    ;["#0b0c0e", "#7aa2ff", "#f2b84b", "#5fd39a", "#e5726b", "#ffffff", "#000000"].map(hex).forEach((c) => {
      expect(fromOklch(toOklch(c))).toBe(c)
    })
  })

  test("out of gamut colours are pulled back into sRGB", () => {
    const c = fromOklch({ l: 0.75, c: 0.4, h: 145 })
    expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(Math.abs(toOklch(c).l - 0.75)).toBeLessThan(0.01)
  })

  test("contrast and hue distance", () => {
    expect(contrast(hex("#000000"), hex("#ffffff"))).toBeCloseTo(21, 5)
    expect(contrast(hex("#7aa2ff"), hex("#7aa2ff"))).toBe(1)
    expect(hueDistance(350, 10)).toBe(20)
    expect(hueDistance(10, 190)).toBe(180)
  })
})

describe("palette", () => {
  test("maps each token to its CSS variable", () => {
    expect(paletteVars(GRAPHITE.palette)).toContainEqual(["--panel-2", hex("#181b1f")])
    expect(paletteVars(GRAPHITE.palette)).toHaveLength(THEME_TOKENS.length + 1)
  })

  test("the select arrow follows the muted colour", () => {
    expect(paletteVars(EMBER.palette)).toContainEqual(["--chevron", chevronImage(EMBER.palette.muted)])
    expect(chevronImage(hex("#a79989"))).toContain("stroke='%23a79989'")
  })

  test("tokens.css defaults match Graphite", () => {
    const css = fs.readFileSync(path.join(import.meta.dir, "../src/renderer/styles/tokens.css"), "utf8")
    THEME_TOKENS.forEach((token) => {
      const value = css.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`))?.[1]
      expect([token, value]).toEqual([token, GRAPHITE.palette[token]])
    })
    expect(css).toContain(`--chevron: ${chevronImage(GRAPHITE.palette.muted)};`)
  })

  test("the editor shows every token exactly once", () => {
    const shown = TOKEN_GROUPS.flatMap((g) => g.tokens.map(([token]) => token))
    expect([...shown].sort()).toEqual([...THEME_TOKENS].sort())
  })
})

describe("built in themes", () => {
  test("ids and names are unique", () => {
    expect(new Set(BUILTIN_THEMES.map((t) => t.id)).size).toBe(BUILTIN_THEMES.length)
    expect(new Set(BUILTIN_THEMES.map((t) => t.name)).size).toBe(BUILTIN_THEMES.length)
  })

  BUILTIN_THEMES.forEach(({ name, palette: p }) => {
    test(`${name} is dark with readable text`, () => {
      expect(luminance(p.bg)).toBeLessThan(0.01)
      const lums = LADDER.map((t) => luminance(p[t]))
      expect(lums).toEqual([...lums].sort((a, b) => a - b))
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.text)
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.muted)
      expect(contrast(p.faint, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.faint)
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.accent)
    })

    test(`${name} status colours stay apart and recognisable`, () => {
      const hues = (["working", "needs", "done", "exited"] as const).map((t) => toOklch(p[t]).h)
      hues.forEach((a, i) => hues.slice(i + 1).forEach((b) => expect(hueDistance(a, b)).toBeGreaterThanOrEqual(40)))
      ;(["needs", "done", "exited"] as const).forEach((t) => {
        expect(hueDistance(toOklch(p[t]).h, STATUS_HUES[t])).toBeLessThanOrEqual(20)
        expect(contrast(p[t], p.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST.status)
      })
    })
  })
})
