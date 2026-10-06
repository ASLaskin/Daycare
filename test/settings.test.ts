import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AppPaths } from "../src/main/AppPaths.ts"
import { SettingsStore } from "../src/main/settings/SettingsStore.ts"
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

describe("SettingsStore", () => {
  const withStore = <A>(userData: string, body: Effect.Effect<A, never, SettingsStore>) =>
    Effect.runPromise(
      body.pipe(
        Effect.provide(
          SettingsStore.layer.pipe(Layer.provide(Layer.succeed(AppPaths, AppPaths.of({ userData, appRoot: userData, home: userData })))),
        ),
      ),
    )

  test("starts from defaults, saves a patch, and reads it back on the next launch", async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-settings-"))
    const first = await withStore(userData, SettingsStore.use((s) => s.get))
    expect(first.model).toBe("opus")
    expect(first.locations).toEqual([{ label: "Home", path: userData }])
    await withStore(userData, SettingsStore.use((s) => s.update({ model: "haiku", layout: "nope" })))
    const again = await withStore(userData, SettingsStore.use((s) => s.get))
    expect([again.model, again.layout]).toEqual(["haiku", "stack"])
  })

  test("a corrupt file falls back to defaults", async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-settings-"))
    fs.writeFileSync(path.join(userData, "settings.json"), "{ nope")
    expect((await withStore(userData, SettingsStore.use((s) => s.get))).model).toBe("opus")
  })
})
