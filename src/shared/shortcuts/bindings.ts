// Effective bindings with user overrides, lookup, and rebind rules.

import { DIGIT, digitFamily, type KeyCombo, normalizeCombo, parseCombo } from "./combo.ts"
import { SHORTCUTS, type ShortcutId } from "./registry.ts"

export type ShortcutOverrides = Readonly<Record<string, KeyCombo>>
export type Bindings = ReadonlyMap<ShortcutId, ReadonlyArray<KeyCombo>>

const normalizeAll = (combos: ReadonlyArray<KeyCombo>, mac: boolean) =>
  combos.flatMap((c) => {
    const n = normalizeCombo(c, mac)
    return n ? [n] : []
  })

// An override replaces every default key of its shortcut
export const resolveBindings = (overrides: ShortcutOverrides, mac: boolean): Bindings =>
  new Map(
    SHORTCUTS.map((s) => {
      const override = s.fixed ? undefined : overrides[s.id]
      const custom = override ? normalizeAll([override], mac) : []
      return [s.id, custom.length ? custom : normalizeAll(s.keys, mac)] as const
    }),
  )

export interface ShortcutHit {
  readonly id: ShortcutId
  // 1 to 9 for digit family shortcuts
  readonly digit: number | null
}

const owner = (bindings: Bindings, combo: KeyCombo) => [...bindings].find(([, combos]) => combos.includes(combo))?.[0]

// Exact match first, then a digit family
export const matchCombo = (bindings: Bindings, combo: KeyCombo, mac: boolean): ShortcutHit | null => {
  const exact = owner(bindings, combo)
  if (exact) {
    return { id: exact, digit: null }
  }
  const family = digitFamily(combo, mac)
  const id = family ? owner(bindings, family) : undefined
  return id ? { id, digit: Number(parseCombo(combo, mac)?.key) } : null
}

const EDIT_KEYS = new Set(["Backspace", "Delete", "Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])

// Text editing, window, and default menu combos
const RESERVED = [
  "Mod+A",
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+Z",
  "Mod+Y",
  "Mod+Shift+Z",
  "Mod+W",
  "Mod+Q",
  "Mod+H",
  "Mod+M",
  "Mod+R",
  "Mod+Shift+R",
  "Mod+0",
  "Mod+=",
  "Mod+-",
  "Mod+Alt+I",
  "Mod+Ctrl+F",
  "Mod+Enter",
]

// macOS text fields treat these as Emacs keys
const MAC_CTRL_LETTERS = "ABDEFHKNOPTVY".split("").map((k) => `Ctrl+${k}`)

const isReserved = (combo: KeyCombo, mac: boolean) =>
  [...RESERVED, ...(mac ? MAC_CTRL_LETTERS : [])].some((r) => normalizeCombo(r, mac) === combo)

// Two combos fire on the same key press
const overlaps = (a: KeyCombo, b: KeyCombo, mac: boolean) =>
  a === b || digitFamily(a, mac) === b || digitFamily(b, mac) === a

// Reason a combo cannot be bound to id, or null
export const bindingProblem = (id: ShortcutId, combo: KeyCombo, bindings: Bindings, mac: boolean): string | null => {
  const parsed = parseCombo(combo, mac)
  if (!parsed) {
    return "Unknown key"
  }
  const wantsDigit = (bindings.get(id) ?? []).some((c) => parseCombo(c, mac)?.key === DIGIT)
  if (wantsDigit !== (parsed.key === DIGIT)) {
    return wantsDigit ? "Hold modifiers and press a number" : "Numbers are taken by the number shortcuts"
  }
  if (!parsed.mods.has("Mod") && !parsed.mods.has("Ctrl") && !/^F\d{1,2}$/.test(parsed.key)) {
    return mac ? "Include ⌘ or ⌃ so typing is not affected" : "Include Ctrl so typing is not affected"
  }
  if (EDIT_KEYS.has(parsed.key) || isReserved(combo, mac)) {
    return "Reserved for editing or the system"
  }
  const clash = SHORTCUTS.find((s) => s.id !== id && (bindings.get(s.id) ?? []).some((c) => overlaps(c, combo, mac)))
  return clash ? `Already used by ${clash.label}` : null
}
