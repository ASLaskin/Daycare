import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AppPaths } from "../src/main/AppPaths.ts"
import { SettingsStore } from "../src/main/settings/SettingsStore.ts"
import { asDirPath, asThemeId } from "../src/shared/ids.ts"
import { baseSettings, mergeSettings, type Settings } from "../src/shared/settings.ts"
import { EMBER, GRAPHITE, TIDE } from "../src/shared/theme/builtins.ts"
import { type HexColor, parseHex } from "../src/shared/theme/color.ts"
import { activeTheme, type CustomTheme, DRAFT_THEME, listThemes, type ThemeState } from "../src/shared/theme/themes.ts"
import { deleteCustom, discardDraft, renameActive, saveDraft, setColor, startDraft, uniqueName } from "../src/renderer/theme/edits.ts"

const defaults: Settings = { ...baseSettings, locations: [{ label: "Home", path: asDirPath("/home") }] }
const hex = (text: string) => parseHex(text) as HexColor
const RED = hex("#ff0000")
const mine: CustomTheme = { id: asThemeId("custom-1"), name: "Mine", palette: { ...TIDE.palette, accent: RED } }
const state = (patch: Partial<ThemeState> = {}): ThemeState => ({ theme: GRAPHITE.id, customThemes: [mine], themeDraft: null, ...patch })
const apply = (s: ThemeState, patch: Partial<ThemeState>): ThemeState => ({ ...s, ...patch })

describe("theme settings decoding", () => {
  test("defaults to Graphite with no presets or draft", () => {
    expect([defaults.theme, defaults.customThemes, defaults.themeDraft]).toEqual([GRAPHITE.id, [], null])
  })

  test("fills missing or bad tokens from Graphite", () => {
    const merged = mergeSettings(defaults, { customThemes: [{ id: "custom-a", name: "A", palette: { bg: "#123", accent: "nope" } }] })
    expect(merged.customThemes[0]?.palette).toEqual({ ...GRAPHITE.palette, bg: hex("#112233") })
  })

  test("drops a broken preset but keeps the others", () => {
    const merged = mergeSettings(defaults, { customThemes: [{ id: "custom-a", name: "A", palette: {} }, { name: 3 }, "x"] })
    expect(merged.customThemes.map((t) => t.id)).toEqual([asThemeId("custom-a")])
  })

  test("keeps a draft and clears it with null", () => {
    const draft = { name: "D", base: "ember", palette: EMBER.palette }
    const withDraft = mergeSettings(defaults, { theme: "draft", themeDraft: draft })
    expect(withDraft.themeDraft?.palette).toEqual(EMBER.palette)
    expect(mergeSettings(withDraft, { themeDraft: null }).themeDraft).toBeNull()
  })

  test("presets survive a restart", async () => {
    const userData = asDirPath(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-theme-")))
    const withStore = <A>(body: Effect.Effect<A, never, SettingsStore>) =>
      Effect.runPromise(
        body.pipe(
          Effect.provide(
            SettingsStore.layer.pipe(Layer.provide(Layer.succeed(AppPaths, AppPaths.of({ userData, appRoot: userData, home: userData })))),
          ),
        ),
      )
    await withStore(SettingsStore.use((s) => s.update({ customThemes: [mine], theme: mine.id })))
    const again = await withStore(SettingsStore.use((s) => s.get))
    expect([again.theme, again.customThemes]).toEqual([mine.id, [mine]])
  })
})

describe("active theme", () => {
  test("resolves built ins, presets and the draft", () => {
    expect(activeTheme(state({ theme: EMBER.id })).palette).toEqual(EMBER.palette)
    expect(activeTheme(state({ theme: mine.id }))).toMatchObject({ kind: "custom", name: "Mine" })
    const draft = { name: "D", base: GRAPHITE.id, palette: TIDE.palette }
    expect(activeTheme(state({ theme: DRAFT_THEME, themeDraft: draft }))).toMatchObject({ kind: "draft", name: "D" })
  })

  test("falls back to Graphite for unknown ids or a missing draft", () => {
    expect(activeTheme(state({ theme: asThemeId("gone") })).id).toBe(GRAPHITE.id)
    expect(activeTheme(state({ theme: DRAFT_THEME })).id).toBe(GRAPHITE.id)
  })

  test("lists built ins, then presets, then the draft", () => {
    const draft = { name: "D", base: GRAPHITE.id, palette: TIDE.palette }
    expect(listThemes(state({ themeDraft: draft })).map((t) => t.kind)).toEqual(["builtin", "builtin", "builtin", "builtin", "custom", "draft"])
  })
})

describe("theme edits", () => {
  test("editing a built in forks an unsaved draft", () => {
    const s = apply(state({ theme: EMBER.id }), setColor(state({ theme: EMBER.id }), "accent", RED))
    expect(s.theme).toBe(DRAFT_THEME)
    expect(s.themeDraft).toEqual({ name: "Ember custom", base: EMBER.id, palette: { ...EMBER.palette, accent: RED } })
  })

  test("editing a preset or the draft changes it in place", () => {
    const s = state({ theme: mine.id })
    expect(apply(s, setColor(s, "bg", RED)).customThemes[0]?.palette.bg).toBe(RED)
    const d = state({ theme: DRAFT_THEME, themeDraft: { name: "D", base: GRAPHITE.id, palette: TIDE.palette } })
    expect(apply(d, setColor(d, "bg", RED)).themeDraft?.palette).toEqual({ ...TIDE.palette, bg: RED })
  })

  test("saving the draft makes a uniquely named preset and selects it", () => {
    const s = apply(state({ theme: TIDE.id }), startDraft(state({ theme: TIDE.id }), "Mine", EMBER.palette))
    const saved = apply(s, saveDraft(s, asThemeId("custom-2")))
    expect(saved.theme).toBe(asThemeId("custom-2"))
    expect(saved.themeDraft).toBeNull()
    expect(saved.customThemes.map((t) => t.name)).toEqual(["Mine", "Mine 2"])
  })

  test("discarding the draft returns to its base", () => {
    const s = apply(state({ theme: TIDE.id }), startDraft(state({ theme: TIDE.id }), "R", EMBER.palette))
    expect(discardDraft(s)).toEqual({ theme: TIDE.id, themeDraft: null })
    const orphan = { ...s, themeDraft: { name: "R", base: asThemeId("gone"), palette: EMBER.palette } }
    expect(discardDraft(orphan).theme).toBe(GRAPHITE.id)
  })

  test("a second draft keeps the first base", () => {
    const first = apply(state({ theme: TIDE.id }), startDraft(state({ theme: TIDE.id }), "R", EMBER.palette))
    expect(startDraft(first, "S", GRAPHITE.palette).themeDraft?.base).toBe(TIDE.id)
  })

  test("renames presets and drafts, never built ins", () => {
    expect(renameActive(state({ theme: EMBER.id }), "Other")).toEqual({})
    expect(renameActive(state({ theme: mine.id }), "  ")).toEqual({})
    expect(renameActive(state({ theme: mine.id }), "Ember").customThemes?.[0]?.name).toBe("Ember 2")
    const d = state({ theme: DRAFT_THEME, themeDraft: { name: "D", base: GRAPHITE.id, palette: TIDE.palette } })
    expect(renameActive(d, " Night  owl ").themeDraft?.name).toBe("Night owl")
  })

  test("deleting the selected preset falls back to Graphite", () => {
    expect(deleteCustom(state({ theme: mine.id }), mine.id)).toEqual({ customThemes: [], theme: GRAPHITE.id })
    expect(deleteCustom(state({ theme: TIDE.id }), mine.id).theme).toBe(TIDE.id)
  })

  test("uniqueName picks the lowest free number", () => {
    expect(uniqueName("Tide", ["Graphite"])).toBe("Tide")
    expect(uniqueName("Tide", ["tide", "Tide 2"])).toBe("Tide 3")
  })
})
