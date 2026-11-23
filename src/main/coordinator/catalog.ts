// Pushes the settings phones start sessions from to the coordinator.

import { Effect, Stream } from "effect"
import { activeAccountOf, allAccounts } from "../../shared/accounts.ts"
import type { CatalogAccount, Choice, DesktopCatalog } from "../../shared/catalog.ts"
import type { Command } from "../../shared/coordinator.ts"
import { CLAUDE_DEFAULT_EFFORT, EFFORT_CHOICES } from "../../shared/efforts.ts"
import type { AccountId, DirPath } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import { CLAUDE_DEFAULT, MODEL_CHOICES, type ModelChoice } from "../../shared/models.ts"
import type { Settings } from "../../shared/settings.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"

const choice = (c: ModelChoice): Choice => ({ id: c.id, label: c.label })

// Same lists as the desktop master pickers
export const CATALOG_MODELS: ReadonlyArray<Choice> = [...MODEL_CHOICES, CLAUDE_DEFAULT].map(choice)
export const CATALOG_EFFORTS: ReadonlyArray<Choice> = [...EFFORT_CHOICES, CLAUDE_DEFAULT_EFFORT].map(choice)

export const catalogOf = (s: Settings, configDirs: ReadonlyMap<AccountId, DirPath | null>): DesktopCatalog => ({
  locations: s.locations,
  accounts: allAccounts(s.accounts).map((a): CatalogAccount => ({ id: a.id, label: a.label, configDir: configDirs.get(a.id) ?? null })),
  activeAccount: activeAccountOf(s),
  defaultLocation: s.locations[s.defaultLocation]?.path ?? null,
  provider: s.provider,
  model: s.masterModel,
  effort: s.masterEffort,
  permissionMode: s.permissionMode,
  models: CATALOG_MODELS,
  efforts: CATALOG_EFFORTS,
  iconPack: s.iconPack,
  randomNames: s.randomNames,
})

// Fields the catalog reads; other settings changes are ignored
const catalogInputs = (s: Settings) =>
  JSON.stringify([
    s.locations,
    s.accounts,
    s.activeAccount,
    s.defaultLocation,
    s.provider,
    s.masterModel,
    s.masterEffort,
    s.permissionMode,
    s.iconPack,
    s.randomNames,
  ])

const sameInputs = (a: Settings, b: Settings) => catalogInputs(a) === catalogInputs(b)

export const makeCatalogSync = (
  settings: SettingsStore["Service"],
  configDir: (id: AccountId) => Effect.Effect<DirPath | null>,
  send: (command: Command) => Promise<Json>,
) => {
  const build = (s: Settings) =>
    Effect.forEach(allAccounts(s.accounts), (a) => configDir(a.id).pipe(Effect.map((dir) => [a.id, dir] as const))).pipe(
      Effect.map((dirs) => catalogOf(s, new Map(dirs))),
    )

  // Dropped while disconnected; connecting pushes again
  const push = (s: Settings) =>
    build(s).pipe(
      Effect.flatMap((catalog) => Effect.tryPromise(() => send({ method: "catalog", catalog }))),
      Effect.ignore,
    )

  return {
    pushCurrent: settings.get.pipe(Effect.flatMap(push)),
    follow: settings.changes.pipe(
      Effect.flatMap((changes) => changes.pipe(Stream.changesWith(sameInputs), Stream.runForEach(push))),
      Effect.forkScoped,
    ),
  }
}
