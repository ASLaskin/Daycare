// Desktop catalog built from settings and pushed to the coordinator.

import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Stream } from "effect"
import { CATALOG_EFFORTS, CATALOG_MODELS, catalogOf, makeCatalogSync } from "../src/main/coordinator/catalog.ts"
import type { SettingsStoreShape } from "../src/main/settings/SettingsStore.ts"
import { DEFAULT_ACCOUNT } from "../src/shared/accounts.ts"
import type { Command } from "../src/shared/coordinator.ts"
import { type AccountId, asAccountId, asDirPath, type DirPath } from "../src/shared/ids.ts"
import { baseSettings, type Settings } from "../src/shared/settings.ts"

const work = asAccountId("work")
const settings: Settings = {
  ...baseSettings,
  locations: [
    { label: "Home", path: asDirPath("/home") },
    { label: "Repo", path: asDirPath("/repo") },
  ],
  defaultLocation: 1,
  accounts: [{ id: work, label: "Work" }],
  activeAccount: work,
  masterModel: "sonnet",
  masterEffort: "high",
}
const dirs = new Map<AccountId, DirPath | null>([
  [DEFAULT_ACCOUNT, null],
  [work, asDirPath("/accounts/work")],
])

const store = (current: Settings, later: ReadonlyArray<Settings> = []): SettingsStoreShape => ({
  get: Effect.succeed(current),
  update: () => Effect.succeed(current),
  changes: Effect.succeed(Stream.fromIterable(later)),
})

describe("catalogOf", () => {
  test("mirrors the new session settings with config dirs", () => {
    const catalog = catalogOf(settings, dirs)
    expect(catalog.accounts).toEqual([
      { id: DEFAULT_ACCOUNT, label: "Default", configDir: null },
      { id: work, label: "Work", configDir: asDirPath("/accounts/work") },
    ])
    expect(catalog.activeAccount).toBe(work)
    expect(catalog.defaultLocation).toBe(asDirPath("/repo"))
    expect(catalog.model).toBe("sonnet")
    expect(catalog.effort).toBe("high")
    expect(catalog.iconPack).toBe(baseSettings.iconPack)
    expect(catalog.randomNames).toBe(baseSettings.randomNames)
    expect(catalog.models).toEqual(CATALOG_MODELS)
    expect(catalog.efforts).toEqual(CATALOG_EFFORTS)
  })

  test("falls back to Default when the active account was removed and to no location when out of range", () => {
    const catalog = catalogOf({ ...settings, accounts: [], defaultLocation: 7 }, dirs)
    expect(catalog.activeAccount).toBe(DEFAULT_ACCOUNT)
    expect(catalog.defaultLocation).toBeNull()
    expect(catalog.accounts.map((a) => a.id)).toEqual([DEFAULT_ACCOUNT])
  })

  test("offers the master pickers' choices, including the defaults", () => {
    expect(CATALOG_MODELS.map((c) => c.id)).toContain("")
    expect(CATALOG_EFFORTS.map((c) => c.id)).toContain("")
    expect(CATALOG_MODELS.every((c) => Object.keys(c).sort().join() === "id,label")).toBe(true)
  })
})

describe("makeCatalogSync", () => {
  const configDir = (id: AccountId) => Effect.succeed(dirs.get(id) ?? null)

  test("pushes the current catalog", async () => {
    const sent: Array<Command> = []
    const sync = makeCatalogSync(store(settings), configDir, async (c) => {
      sent.push(c)
      return {}
    })
    await Effect.runPromise(sync.pushCurrent)
    expect(sent).toEqual([{ method: "catalog", catalog: catalogOf(settings, dirs) }])
  })

  test("follows only changes the catalog reads", async () => {
    const sent: Array<Command> = []
    const changes = [settings, { ...settings, theme: baseSettings.theme, sidebarWidth: 400 }, { ...settings, masterModel: "opus" }]
    const sync = makeCatalogSync(store(settings, changes), configDir, async (c) => {
      sent.push(c)
      return {}
    })
    await Effect.runPromise(Effect.scoped(sync.follow.pipe(Effect.flatMap(Fiber.join))))
    expect(sent.map((c) => (c.method === "catalog" ? c.catalog.model : null))).toEqual(["sonnet", "opus"])
  })

  test("ignores a disconnected coordinator", async () => {
    const sync = makeCatalogSync(store(settings), configDir, () => Promise.reject(new Error("coordinator is not connected")))
    await Effect.runPromise(sync.pushCurrent)
  })
})
