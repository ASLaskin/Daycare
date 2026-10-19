// Key combos: canonical form, key presses, and display.

import { Schema } from "effect"

// Portable combo like Mod+Shift+T; Mod is Cmd on macOS, Ctrl elsewhere
export const KeyCombo = Schema.String.pipe(Schema.brand("KeyCombo"))
export type KeyCombo = typeof KeyCombo.Type
export const asKeyCombo = (s: string) => s as KeyCombo

// Key standing for any digit 1 to 9
export const DIGIT = "#"

const MODIFIERS = ["Mod", "Ctrl", "Alt", "Shift", "Super"] as const
type Modifier = (typeof MODIFIERS)[number]

export interface ParsedCombo {
  readonly mods: ReadonlySet<Modifier>
  readonly key: string
}

// Physical key state, from a DOM event or Electron input
export interface KeyPress {
  readonly key: string
  readonly code: string
  readonly meta: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
}

const isModifier = (s: string): s is Modifier => MODIFIERS.some((m) => m === s)

const build = (mods: ReadonlySet<Modifier>, key: string) => asKeyCombo([...MODIFIERS.filter((m) => mods.has(m)), key].join("+"))

// Ctrl and Mod are the same key off macOS
export const parseCombo = (combo: string, mac: boolean): ParsedCombo | null => {
  const parts = combo.split("+")
  const key = parts.pop()
  if (!key || isModifier(key) || !parts.every(isModifier)) {
    return null
  }
  return { mods: new Set(parts.filter(isModifier).map((m) => (!mac && m === "Ctrl" ? "Mod" : m))), key }
}

export const normalizeCombo = (combo: string, mac: boolean): KeyCombo | null => {
  const parsed = parseCombo(combo, mac)
  return parsed ? build(parsed.mods, parsed.key) : null
}

// Unshifted punctuation by physical key
const CODE_KEYS: Readonly<Record<string, string>> = {
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
}

const NAMED_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
])

// Layout aware letters, physical digits and punctuation
const keyToken = (p: KeyPress): string | null => {
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(p.code)?.[1]
  if (digit) {
    return digit
  }
  if (/^[a-z]$/i.test(p.key)) {
    return p.key.toUpperCase()
  }
  const letter = /^Key([A-Z])$/.exec(p.code)?.[1]
  if (letter) {
    return letter
  }
  const punct = CODE_KEYS[p.code]
  if (punct) {
    return punct
  }
  if (NAMED_KEYS.has(p.key) || /^F\d{1,2}$/.test(p.key)) {
    return p.key
  }
  return null
}

// Null for lone modifiers and unknown keys
export const pressCombo = (p: KeyPress, mac: boolean): KeyCombo | null => {
  const key = keyToken(p)
  if (!key) {
    return null
  }
  const mods = new Set<Modifier>([
    ...(p.meta ? [mac ? "Mod" : "Super"] as const : []),
    ...(p.ctrl ? [mac ? "Ctrl" : "Mod"] as const : []),
    ...(p.alt ? ["Alt"] as const : []),
    ...(p.shift ? ["Shift"] as const : []),
  ])
  return build(mods, key)
}

export const isDigitKey = (key: string) => /^[1-9]$/.test(key)

// Digit combo widened to its 1 to 9 family
export const digitFamily = (combo: KeyCombo, mac: boolean): KeyCombo | null => {
  const parsed = parseCombo(combo, mac)
  return parsed && isDigitKey(parsed.key) ? build(parsed.mods, DIGIT) : null
}

export const withDigit = (combo: KeyCombo, digit: number, mac: boolean): KeyCombo => {
  const parsed = parseCombo(combo, mac)
  return parsed ? build(parsed.mods, parsed.key === DIGIT ? String(digit) : parsed.key) : combo
}

const MAC_ORDER: ReadonlyArray<readonly [Modifier, string]> = [
  ["Ctrl", "⌃"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  ["Mod", "⌘"],
]

const OTHER_ORDER: ReadonlyArray<readonly [Modifier, string]> = [
  ["Mod", "Ctrl"],
  ["Super", "Win"],
  ["Alt", "Alt"],
  ["Shift", "Shift"],
]

const MAC_KEYS: Readonly<Record<string, string>> = {
  Enter: "↩",
  Tab: "⇥",
  Escape: "Esc",
  Backspace: "⌫",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
}

const OTHER_KEYS: Readonly<Record<string, string>> = {
  Escape: "Esc",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
}

const formatOne = (combo: KeyCombo, mac: boolean) => {
  const parsed = parseCombo(combo, mac)
  if (!parsed) {
    return combo
  }
  const order = mac ? MAC_ORDER : OTHER_ORDER
  const mods = order.filter(([m]) => parsed.mods.has(m)).map(([, label]) => label)
  const key = (mac ? MAC_KEYS : OTHER_KEYS)[parsed.key] ?? parsed.key
  return mac ? [...mods, key].join("") : [...mods, key].join("+")
}

// Display text, with digit families as a range
export const formatCombo = (combo: KeyCombo, mac: boolean) =>
  parseCombo(combo, mac)?.key === DIGIT
    ? `${formatOne(withDigit(combo, 1, mac), mac)} to ${formatOne(withDigit(combo, 9, mac), mac)}`
    : formatOne(combo, mac)
