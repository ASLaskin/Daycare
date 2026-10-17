// Theme preset edits as settings patches.

import type { ThemeId } from "../../shared/ids.ts"
import { BUILTIN_THEMES, GRAPHITE } from "../../shared/theme/builtins.ts"
import type { HexColor } from "../../shared/theme/color.ts"
import type { Palette, ThemeToken } from "../../shared/theme/palette.ts"
import { activeTheme, DRAFT_THEME, type ThemeState } from "../../shared/theme/themes.ts"

export type ThemePatch = Partial<ThemeState>

export const MAX_NAME = 40

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME)

// Name, or name with the lowest free number after it
export const uniqueName = (name: string, taken: ReadonlyArray<string>) => {
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  const free = (n: number) => !lower.has((n === 1 ? name : `${name} ${n}`).toLowerCase())
  const n = Array.from({ length: taken.length + 1 }, (_, i) => i + 1).find(free) ?? taken.length + 1
  return n === 1 ? name : `${name} ${n}`
}

const takenNames = (s: ThemeState) => [...BUILTIN_THEMES.map((t) => t.name), ...s.customThemes.map((t) => t.name)]

const isSaved = (s: ThemeState, id: ThemeId) => [...BUILTIN_THEMES, ...s.customThemes].some((t) => t.id === id)

// Selected saved theme, or the one the draft started from
const savedBase = (s: ThemeState): ThemeId => {
  const id = s.theme === DRAFT_THEME ? s.themeDraft?.base : s.theme
  return id && isSaved(s, id) ? id : GRAPHITE.id
}

export const startDraft = (s: ThemeState, name: string, palette: Palette): ThemePatch => ({
  theme: DRAFT_THEME,
  themeDraft: { name: cleanName(name) || "Untitled", base: savedBase(s), palette },
})

// Built ins fork into a draft; custom presets and the draft change in place
export const setColor = (s: ThemeState, token: ThemeToken, color: HexColor): ThemePatch => {
  const active = activeTheme(s)
  const palette = { ...active.palette, [token]: color }
  if (active.kind === "custom") {
    return { customThemes: s.customThemes.map((t) => (t.id === active.id ? { ...t, palette } : t)) }
  }
  if (active.kind === "draft" && s.themeDraft) {
    return { themeDraft: { ...s.themeDraft, palette } }
  }
  return startDraft(s, `${active.name} custom`, palette)
}

export const renameActive = (s: ThemeState, name: string): ThemePatch => {
  const next = cleanName(name)
  const active = activeTheme(s)
  if (!next || next === active.name) {
    return {}
  }
  if (active.kind === "draft" && s.themeDraft) {
    return { themeDraft: { ...s.themeDraft, name: next } }
  }
  if (active.kind !== "custom") {
    return {}
  }
  const taken = takenNames(s).filter((t) => t !== active.name)
  const unique = uniqueName(next, taken)
  return { customThemes: s.customThemes.map((t) => (t.id === active.id ? { ...t, name: unique } : t)) }
}

export const saveDraft = (s: ThemeState, id: ThemeId): ThemePatch => {
  if (!s.themeDraft) {
    return {}
  }
  const name = uniqueName(s.themeDraft.name, takenNames(s))
  return {
    customThemes: [...s.customThemes, { id, name, palette: s.themeDraft.palette }],
    theme: id,
    themeDraft: null,
  }
}

export const discardDraft = (s: ThemeState): ThemePatch => ({ theme: savedBase(s), themeDraft: null })

export const deleteCustom = (s: ThemeState, id: ThemeId): ThemePatch => ({
  customThemes: s.customThemes.filter((t) => t.id !== id),
  theme: s.theme === id ? GRAPHITE.id : s.theme,
})
