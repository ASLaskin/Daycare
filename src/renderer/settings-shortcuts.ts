// Settings shortcuts panel: list and rebind keys.

import { bindingProblem } from "../shared/shortcuts/bindings.ts"
import { DIGIT, digitFamily, formatCombo, type KeyCombo } from "../shared/shortcuts/combo.ts"
import { SHORTCUTS, type Shortcut, type ShortcutId } from "../shared/shortcuts/registry.ts"
import { $, el } from "./dom.ts"
import { bindings, IS_MAC, keyCapture, pressOf } from "./keymap.ts"
import { saveSettings, settings } from "./store.ts"
import { toast } from "./toast.ts"

let recording: ShortcutId | null = null

const keysText = (id: ShortcutId) => (bindings().get(id) ?? []).map((c) => formatCombo(c, IS_MAC)).join(" or ")

const isDigitShortcut = (s: Shortcut) => s.keys.some((k) => k.endsWith(`+${DIGIT}`))

const saveOverride = (id: ShortcutId, combo: KeyCombo | null) => {
  const rest = Object.fromEntries(Object.entries(settings().shortcuts).filter(([key]) => key !== id))
  return saveSettings({ shortcuts: combo ? { ...rest, [id]: combo } : rest })
}

const stopRecording = () => {
  recording = null
  keyCapture.handler = null
  renderShortcuts()
}

// Digit presses bind the whole 1 to 9 family
const onCapture = (s: Shortcut) => (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    stopRecording()
    return
  }
  const pressed = pressOf(e)
  if (!pressed) {
    return
  }
  const combo = isDigitShortcut(s) ? (digitFamily(pressed, IS_MAC) ?? pressed) : pressed
  const problem = bindingProblem(s.id, combo, bindings(), IS_MAC)
  if (problem) {
    toast(problem)
    return
  }
  stopRecording()
  void saveOverride(s.id, combo)
}

const startRecording = (s: Shortcut) => {
  recording = s.id
  keyCapture.handler = onCapture(s)
  renderShortcuts()
}

const keyButton = (s: Shortcut) => {
  if (s.fixed) {
    return el("span", "shortcut-keys fixed", keysText(s.id))
  }
  const on = recording === s.id
  const b = el("button", "shortcut-keys", on ? "Press keys" : keysText(s.id))
  b.type = "button"
  b.setAttribute("aria-pressed", String(on))
  b.title = on ? "Esc cancels" : "Click to change"
  b.onclick = () => (on ? stopRecording() : startRecording(s))
  if (on) {
    requestAnimationFrame(() => b.focus())
  }
  return b
}

const resetButton = (id: ShortcutId) => {
  const b = el("button", "ghost", "Reset")
  b.type = "button"
  b.onclick = () => void saveOverride(id, null)
  return b
}

const row = (s: Shortcut) => {
  const r = el("div", "shortcut-row")
  const text = el("div")
  text.append(el("div", "toggle-label", s.label))
  if (s.hint) {
    text.append(el("div", "hint", s.hint))
  }
  r.append(text, keyButton(s), s.id in settings().shortcuts ? resetButton(s.id) : el("span"))
  return r
}

export const renderShortcuts = () => {
  $("#shortcut-rows").replaceChildren(...SHORTCUTS.map(row))
  $("#reset-shortcuts").toggleAttribute("disabled", !Object.keys(settings().shortcuts).length)
}

export const wireShortcuts = () => {
  $("#reset-shortcuts").onclick = () => void saveSettings({ shortcuts: {} })
}

// Leaving the panel drops a pending rebind
export const cancelRecording = () => {
  if (recording) {
    stopRecording()
  }
}
