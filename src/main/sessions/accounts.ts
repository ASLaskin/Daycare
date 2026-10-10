// Switching the active account and removing accounts.

import { Effect, Schema } from "effect"
import { accountLabel, activeAccountOf, DEFAULT_ACCOUNT, hasAccount } from "../../shared/accounts.ts"
import type { AccountId } from "../../shared/ids.ts"
import type { Settings } from "../../shared/settings.ts"
import { inUseMessage, removeDialog, switchChoice, switchDialog } from "../accounts/dialogs.ts"
import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import { makeMover } from "./move.ts"

export class AccountInUse extends Schema.TaggedError<AccountInUse>()("AccountInUse", { message: Schema.String }) {}

export interface AccountActions {
  // Asks first when sessions run on another account
  readonly switchAccount: (to: AccountId) => Effect.Effect<Settings>
  readonly removeAccount: (id: AccountId) => Effect.Effect<Settings, AccountInUse>
}

export const makeAccountActions = (core: Core, lifecycle: Lifecycle): AccountActions => {
  const { settings, ui, accounts } = core.deps
  const moveSession = makeMover(core)
  const all = () => [...core.sessions.values()]

  const switchAccount = (to: AccountId) =>
    Effect.gen(function* () {
      const current = yield* settings.get
      if (!hasAccount(current.accounts, to) || activeAccountOf(current) === to) {
        return current
      }
      const elsewhere = all().filter((s) => s.accountId !== to && core.isRunning(s))
      const choice = elsewhere.length
        ? switchChoice(yield* ui.choose(switchDialog(elsewhere.length, accountLabel(current.accounts, to))))
        : "keep"
      if (choice === "cancel") {
        return current
      }
      const next = yield* settings.update({ activeAccount: to })
      if (choice === "restart") {
        elsewhere.forEach((s) => {
          s.restartOn = to
          lifecycle.killSession(s)
        })
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
      const users = all().filter((s) => s.accountId === id)
      const running = users.filter(core.isRunning)
      if (running.length) {
        return yield* new AccountInUse({ message: inUseMessage(label, running.length) })
      }
      if (!(yield* ui.confirm(removeDialog(label, users.length)))) {
        return current
      }
      users.forEach((s) => moveSession(s, DEFAULT_ACCOUNT))
      core.persist()
      users.forEach(core.update)
      yield* accounts.forget(id)
      const accountsLeft = current.accounts.filter((a) => a.id !== id)
      return yield* settings.update({ accounts: accountsLeft, activeAccount: activeAccountOf({ accounts: accountsLeft, activeAccount: current.activeAccount }) })
    })

  return { switchAccount, removeAccount }
}
