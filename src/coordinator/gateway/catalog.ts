// Phone session creation filled in from the desktop catalog.

import { DEFAULT_ACCOUNT } from "../../shared/accounts.ts"
import type { DesktopCatalog } from "../../shared/catalog.ts"
import type { CreateCommand, LiveSession } from "../../shared/coordinator.ts"
import type { AccountId, DirPath } from "../../shared/ids.ts"
import type { MobileCreateCommand } from "../../shared/mobile.ts"
import { defaultMasterName, nextIcon } from "../../main/sessions/naming.ts"

type Create = typeof CreateCommand.Type
type MobileCreate = typeof MobileCreateCommand.Type

// Catalog account's config dir, or null when unknown
export const configDirOf = (catalog: DesktopCatalog, id: AccountId): { readonly configDir: DirPath | null } | null => {
  const account = catalog.accounts.find((a) => a.id === id)
  return account ? { configDir: account.configDir } : null
}

// Catalog locations and existing session folders
export const allowedCwd = (catalog: DesktopCatalog, sessions: ReadonlyArray<LiveSession>, cwd: DirPath) =>
  catalog.locations.some((l) => l.path === cwd) || sessions.some((s) => s.cwd === cwd)

// Hub create command with an empty prompt, or why it is refused
export const createCommand = (
  catalog: DesktopCatalog | null,
  sessions: ReadonlyArray<LiveSession>,
  command: MobileCreate,
): { readonly create: Create } | { readonly error: string } => {
  if (!catalog) {
    return { error: "open Daycare on the Mac once so the phone knows its folders and accounts" }
  }
  if (!allowedCwd(catalog, sessions, command.cwd)) {
    return { error: `${command.cwd} is not a saved location` }
  }
  const claude = command.provider === "claude"
  const accountId = claude ? (command.accountId ?? catalog.activeAccount) : DEFAULT_ACCOUNT
  const account = claude ? configDirOf(catalog, accountId) : { configDir: null }
  if (!account) {
    return { error: `unknown account ${accountId}` }
  }
  const name =
    command.name?.trim() ||
    defaultMasterName({
      cwd: command.cwd,
      taken: new Set(sessions.map((s) => s.name)),
      randomNames: catalog.randomNames,
      locationLabel: catalog.locations.find((l) => l.path === command.cwd)?.label,
    })
  return {
    create: {
      method: "create",
      provider: command.provider,
      cwd: command.cwd,
      prompt: "",
      name,
      icon: nextIcon(new Set(sessions.filter((s) => s.role === "master").map((s) => s.icon)), catalog.iconPack),
      model: claude ? command.model || null : null,
      effort: claude ? command.effort || null : null,
      permissionMode: command.permissionMode,
      accountId,
      configDir: account.configDir,
    },
  }
}
