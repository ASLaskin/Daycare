// Switching the active account and removing accounts.

import { Effect, Schema } from "effect"
import { accountLabel, activeAccountOf, DEFAULT_ACCOUNT, hasAccount } from "../../shared/accounts.ts"
import type { AccountId } from "../../shared/ids.ts"
import type { Settings } from "../../shared/settings.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"
import type { Ui } from "../Ui.ts"
import type { Accounts } from "./Accounts.ts"
import { inUseMessage, removeDialog, switchChoice, switchDialog } from "./dialogs.ts"

export class AccountInUse extends Schema.TaggedError<AccountInUse>()("AccountInUse", { message: Schema.String }) {}

export interface AccountActions {
  // Asks first when sessions run on another account
  readonly switchAccount: (to: AccountId) => Effect.Effect<Settings>
  readonly removeAccount: (id: AccountId) => Effect.Effect<Settings, AccountInUse>
}

interface ActionDeps {
  readonly settings: SettingsStore["Service"]
  readonly ui: Ui["Service"]
  readonly accounts: Accounts["Service"]
}

// Sessions as seen by account actions
export interface AccountUsers<S extends { readonly accountId: AccountId }> {
  readonly all: () => ReadonlyArray<S>
  readonly isRunning: (s: S) => boolean
  // Stops running sessions, resuming them on another account
  readonly restart: (running: ReadonlyArray<S>, to: AccountId) => Effect.Effect<void>
  // Points stopped sessions at another account
  readonly move: (stopped: ReadonlyArray<S>, to: AccountId) => Effect.Effect<void>
}

export const makeAccountActions = <S extends { readonly accountId: AccountId }>(
  { settings, ui, accounts }: ActionDeps,
  users: AccountUsers<S>,
): AccountActions => {
  const switchAccount = (to: AccountId) =>
    Effect.gen(function* () {
      const current = yield* settings.get
      if (!hasAccount(current.accounts, to) || activeAccountOf(current) === to) {
        return current
      }
      const elsewhere = users.all().filter((s) => s.accountId !== to && users.isRunning(s))
      const choice = elsewhere.length
        ? switchChoice(yield* ui.choose(switchDialog(elsewhere.length, accountLabel(current.accounts, to))))
        : "keep"
      if (choice === "cancel") {
        return current
      }
      const next = yield* settings.update({ activeAccount: to })
      if (choice === "restart") {
        yield* users.restart(elsewhere, to)
      }
      return next
    })

  const removeAccount = (id: AccountId) =>
    Effect.gen(function* () {
      const current = yield* settings.get
      if (id === DEFAULT_ACCOUNT || !hasAccount(current.accounts, id)) {
        return current
      }
      const label = accountLabel(current.accounts, id)
      const owned = users.all().filter((s) => s.accountId === id)
      const running = owned.filter(users.isRunning)
      if (running.length) {
        return yield* new AccountInUse({ message: inUseMessage(label, running.length) })
      }
      if (!(yield* ui.confirm(removeDialog(label, owned.length)))) {
        return current
      }
      yield* users.move(owned, DEFAULT_ACCOUNT)
      yield* accounts.forget(id)
      const accountsLeft = current.accounts.filter((a) => a.id !== id)
      return yield* settings.update({ accounts: accountsLeft, activeAccount: activeAccountOf({ accounts: accountsLeft, activeAccount: current.activeAccount }) })
    })

  return { switchAccount, removeAccount }
}
