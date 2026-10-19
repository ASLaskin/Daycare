import { describe, expect, test } from "bun:test"
import { bindingProblem, matchCombo, resolveBindings } from "../src/shared/shortcuts/bindings.ts"
import { asKeyCombo, formatCombo, type KeyPress, normalizeCombo, pressCombo } from "../src/shared/shortcuts/combo.ts"
import { SHORTCUTS } from "../src/shared/shortcuts/registry.ts"

const press = (over: Partial<KeyPress>): KeyPress => ({ key: "", code: "", meta: false, ctrl: false, alt: false, shift: false, ...over })

describe("combos", () => {
  test("Mod is Cmd on macOS and Ctrl elsewhere", () => {
    expect(pressCombo(press({ key: "t", code: "KeyT", meta: true }), true)).toBe(asKeyCombo("Mod+T"))
    expect(pressCombo(press({ key: "t", code: "KeyT", ctrl: true }), false)).toBe(asKeyCombo("Mod+T"))
    expect(pressCombo(press({ key: "t", code: "KeyT", ctrl: true }), true)).toBe(asKeyCombo("Ctrl+T"))
    expect(normalizeCombo("Ctrl+Shift+Tab", false)).toBe(asKeyCombo("Mod+Shift+Tab"))
  })

  test("shifted digits and punctuation use the physical key", () => {
    expect(pressCombo(press({ key: "!", code: "Digit1", meta: true, shift: true }), true)).toBe(asKeyCombo("Mod+Shift+1"))
    expect(pressCombo(press({ key: "}", code: "BracketRight", meta: true, shift: true }), true)).toBe(asKeyCombo("Mod+Shift+]"))
    expect(pressCombo(press({ key: "†", code: "KeyT", meta: true, alt: true }), true)).toBe(asKeyCombo("Mod+Alt+T"))
  })

  test("lone modifiers are not combos", () => {
    expect(pressCombo(press({ key: "Meta", code: "MetaLeft", meta: true }), true)).toBeNull()
  })

  test("formats per platform", () => {
    expect(formatCombo(asKeyCombo("Mod+Shift+A"), true)).toBe("⇧⌘A")
    expect(formatCombo(asKeyCombo("Mod+Shift+A"), false)).toBe("Ctrl+Shift+A")
    expect(formatCombo(asKeyCombo("Mod+#"), true)).toBe("⌘1 to ⌘9")
  })
})

describe("bindings", () => {
  const mac = resolveBindings({}, true)

  test("defaults never overlap", () => {
    ;[true, false].forEach((isMac) => {
      const b = resolveBindings({}, isMac)
      const all = [...b.values()].flat()
      expect(new Set(all).size).toBe(all.length)
    })
  })

  test("matches exact keys and digit families", () => {
    expect(matchCombo(mac, asKeyCombo("Mod+T"), true)).toEqual({ id: "newSession", digit: null })
    expect(matchCombo(mac, asKeyCombo("Mod+3"), true)).toEqual({ id: "jumpAgent", digit: 3 })
    expect(matchCombo(mac, asKeyCombo("Mod+Shift+2"), true)).toEqual({ id: "newSessionAt", digit: 2 })
    expect(matchCombo(mac, asKeyCombo("Mod+0"), true)).toBeNull()
  })

  test("an override replaces the defaults; fixed ones ignore it", () => {
    const b = resolveBindings({ newSession: asKeyCombo("Mod+Alt+N"), closeSession: asKeyCombo("Mod+K") }, true)
    expect(b.get("newSession")).toEqual([asKeyCombo("Mod+Alt+N")])
    expect(matchCombo(b, asKeyCombo("Mod+T"), true)).toBeNull()
    expect(b.get("closeSession")).toEqual([asKeyCombo("Mod+W")])
  })

  test("rebind rules", () => {
    expect(bindingProblem("toggleAttachments", asKeyCombo("Mod+K"), mac, true)).toBeNull()
    expect(bindingProblem("toggleAttachments", asKeyCombo("Shift+K"), mac, true)).toContain("typing")
    expect(bindingProblem("toggleAttachments", asKeyCombo("Mod+C"), mac, true)).toContain("Reserved")
    expect(bindingProblem("toggleAttachments", asKeyCombo("Ctrl+E"), mac, true)).toContain("Reserved")
    expect(bindingProblem("toggleAttachments", asKeyCombo("Mod+B"), mac, true)).toBe("Already used by Sidebar")
    expect(bindingProblem("toggleAttachments", asKeyCombo("Mod+4"), mac, true)).toBe("Already used by Focus agent")
    expect(bindingProblem("jumpAgent", asKeyCombo("Mod+Alt+#"), mac, true)).toBeNull()
    expect(bindingProblem("jumpAgent", asKeyCombo("Mod+K"), mac, true)).toContain("number")
  })

  test("every shortcut has keys", () => {
    SHORTCUTS.forEach((s) => expect(mac.get(s.id)?.length).toBeGreaterThan(0))
  })
})
