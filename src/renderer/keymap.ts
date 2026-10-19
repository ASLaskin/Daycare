// Effective shortcut bindings for this platform and settings.

import { type Bindings, resolveBindings, type ShortcutOverrides } from "../shared/shortcuts/bindings.ts"
import { formatCombo, type KeyCombo, pressCombo, withDigit } from "../shared/shortcuts/combo.ts"
import type { ShortcutId } from "../shared/shortcuts/registry.ts"
import { settings } from "./store.ts"

export const IS_MAC = /Mac/.test(navigator.userAgent)

let cache: { readonly source: ShortcutOverrides; readonly bindings: Bindings } | null = null

export const bindings = (): Bindings => {
  const source = settings().shortcuts
  if (cache?.source !== source) {
    cache = { source, bindings: resolveBindings(source, IS_MAC) }
  }
  return cache.bindings
}

export const primaryCombo = (id: ShortcutId): KeyCombo | null => bindings().get(id)?.[0] ?? null

export const pressOf = (e: KeyboardEvent): KeyCombo | null =>
  pressCombo({ key: e.key, code: e.code, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }, IS_MAC)

export const shortcutText = (id: ShortcutId): string => {
  const combo = primaryCombo(id)
  return combo ? formatCombo(combo, IS_MAC) : ""
}

// Display text for one key of a digit family
export const digitShortcutText = (id: ShortcutId, digit: number): string => {
  const combo = primaryCombo(id)
  return combo ? formatCombo(withDigit(combo, digit, IS_MAC), IS_MAC) : ""
}

// Label with its shortcut, like Settings (⌘,)
export const withShortcut = (label: string, id: ShortcutId) => {
  const text = shortcutText(id)
  return text ? `${label} (${text})` : label
}

// Settings rebinding takes every key press while set
export const keyCapture = { handler: null as ((e: KeyboardEvent) => void) | null }
