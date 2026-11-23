// What a client needs to start sessions, mirrored from desktop settings.

import { Schema } from "effect"
import { Account } from "./accounts.ts"
import { IconPack } from "./icons.ts"
import { AccountId, DirPath } from "./ids.ts"
import { PermissionMode, Provider } from "./session.ts"
import { Location } from "./settings.ts"

export const Choice = Schema.Struct({ id: Schema.String, label: Schema.String })
export type Choice = typeof Choice.Type

// Phone view of the catalog, without config dirs
export const Catalog = Schema.Struct({
  locations: Schema.Array(Location),
  // Default first
  accounts: Schema.Array(Account),
  activeAccount: AccountId,
  defaultLocation: Schema.NullOr(DirPath),
  provider: Provider,
  model: Schema.String,
  effort: Schema.String,
  permissionMode: PermissionMode,
  models: Schema.Array(Choice),
  efforts: Schema.Array(Choice),
})
export type Catalog = typeof Catalog.Type

// Account with the Claude config dir the coordinator launches with
export const CatalogAccount = Schema.Struct({ ...Account.fields, configDir: Schema.NullOr(DirPath) })
export type CatalogAccount = typeof CatalogAccount.Type

// Pushed by the desktop over the socket on connect and on settings change
export const DesktopCatalog = Schema.Struct({
  ...Catalog.fields,
  accounts: Schema.Array(CatalogAccount),
  iconPack: IconPack,
  randomNames: Schema.Boolean,
})
export type DesktopCatalog = typeof DesktopCatalog.Type

// Drops what phones never see
export const phoneCatalog = (c: DesktopCatalog): Catalog => ({
  locations: c.locations,
  accounts: c.accounts.map((a) => ({ id: a.id, label: a.label })),
  activeAccount: c.activeAccount,
  defaultLocation: c.defaultLocation,
  provider: c.provider,
  model: c.model,
  effort: c.effort,
  permissionMode: c.permissionMode,
  models: c.models,
  efforts: c.efforts,
})
