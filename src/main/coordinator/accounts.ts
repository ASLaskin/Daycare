// Account actions over coordinator sessions.

import { Effect } from "effect"
import { DEFAULT_ACCOUNT, hasAccount } from "../../shared/accounts.ts"
import type { Command, LiveSession } from "../../shared/coordinator.ts"
import type { AccountId, SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import type { SessionView } from "../../shared/session.ts"
import type { Accounts } from "../accounts/Accounts.ts"
import { makeAccountActions } from "../accounts/actions.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"
import type { Ui } from "../Ui.ts"

interface CoordinatorAccountDeps {
  readonly settings: SettingsStore["Service"]
  readonly ui: Ui["Service"]
  readonly accounts: Accounts["Service"]
  readonly request: (command: Command) => Effect.Effect<Json>
  readonly sessions: () => ReadonlyArray<SessionView>
  readonly isLive: (id: SessionId) => boolean
}

export const makeCoordinatorAccounts = (deps: CoordinatorAccountDeps) => {
  const { settings, accounts, request } = deps

  // Running ones resume on the next message
  const moveTo = (list: ReadonlyArray<{ readonly id: SessionId }>, to: AccountId) =>
    accounts.configDir(to).pipe(
      Effect.flatMap((configDir) => Effect.forEach(list, (s) => request({ method: "move", session: s.id, accountId: to, configDir }), { discard: true })),
    )

  const actions = makeAccountActions(deps, {
    all: () => deps.sessions().filter((s) => s.provider === "claude"),
    isRunning: (s) => deps.isLive(s.id),
    restart: moveTo,
    move: moveTo,
  })

  // Sessions on accounts removed while the coordinator was off
  const rehome = (list: ReadonlyArray<LiveSession>) =>
    settings.get.pipe(
      Effect.flatMap((current) =>
        moveTo(
          list.filter((s) => s.provider === "claude" && !hasAccount(current.accounts, s.accountId)),
          DEFAULT_ACCOUNT,
        ),
      ),
    )

  return { actions, rehome }
}
