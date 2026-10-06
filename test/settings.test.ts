import { describe, expect, test } from "bun:test"
import { baseSettings, mergeSettings, type Settings } from "../src/shared/settings.ts"

const defaults: Settings = { ...baseSettings, locations: [{ label: "Home", path: "/home" }] }

describe("mergeSettings", () => {
  test("keeps valid fields and drops invalid ones", () => {
    const merged = mergeSettings(defaults, { model: "sonnet", layout: "diagonal", maxCols: 2.5, splits: { stack: 40 } })
    expect(merged.model).toBe("sonnet")
    expect(merged.layout).toBe("stack")
    expect(merged.maxCols).toBe(4)
    expect(merged.splits).toEqual({ stack: 40 })
  })

  test("ignores unknown keys and non-objects", () => {
    expect(mergeSettings(defaults, { nope: true })).toEqual(defaults)
    expect(mergeSettings(defaults, "garbage")).toEqual(defaults)
    expect(mergeSettings(defaults, null)).toEqual(defaults)
  })
})
