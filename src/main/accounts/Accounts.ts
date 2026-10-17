// Claude accounts: config dirs, sign in, and status.

import { Context, Effect, Layer } from "effect"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import { type Account, type AccountStatus, allAccounts, uniqueLabel } from "../../shared/accounts.ts"
import { type AccountId, asAccountId, type DirPath } from "../../shared/ids.ts"
import { AppPaths } from "../AppPaths.ts"
import { ClaudeBinary } from "../sessions/Claude.ts"
import { cleanEnv } from "../sessions/env.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { Ui } from "../Ui.ts"
import { type AuthState, parseAuthStatus } from "./auth.ts"
import { makeLogins } from "./login.ts"
import { configDirFor, configHomeFor, withConfigDir } from "./paths.ts"
import { linkSharedConfig } from "./shared-config.ts"

const STATUS_TIMEOUT_MS = 15000

export interface AccountsShape {
  readonly list: Effect.Effect<ReadonlyArray<AccountStatus>>
  readonly add: (label: string) => Effect.Effect<Account>
  // Env for a claude child on an account, creating its dir
  readonly childEnv: (id: AccountId, base: NodeJS.ProcessEnv) => Effect.Effect<NodeJS.ProcessEnv>
  // CLAUDE_CONFIG_DIR for an account, creating it; null is ~/.claude
  readonly configDir: (id: AccountId) => Effect.Effect<DirPath | null>
  // Folder holding an account's credentials file and transcripts
  readonly configHome: (id: AccountId) => DirPath
  readonly login: (id: AccountId) => Effect.Effect<void>
  readonly loginCode: (id: AccountId, code: string) => Effect.Effect<void>
  readonly cancelLogin: (id: AccountId) => Effect.Effect<void>
  // Signs out and deletes an added account's dir
  readonly forget: (id: AccountId) => Effect.Effect<void>
}

export class Accounts extends Context.Service<Accounts, AccountsShape>()("daycare/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const { userData, home } = yield* AppPaths
      const claude = yield* ClaudeBinary
      const settings = yield* SettingsStore
      const ui = yield* Ui
      const logins = makeLogins(claude.path, (p) => ui.send("account:login", p))
      yield* Effect.addFinalizer(() => Effect.sync(logins.cancelAll))

      const prepare = (id: AccountId) => {
        const dir = configDirFor(userData, id)
        if (dir) {
          linkSharedConfig(home, dir)
        }
        return dir
      }

      const envFor = (id: AccountId, base: NodeJS.ProcessEnv) => withConfigDir(base, prepare(id))

      const runAuth = (id: AccountId, args: ReadonlyArray<string>) =>
        Effect.callback<string>((resume) => {
          execFile(claude.path, ["auth", ...args], { env: envFor(id, cleanEnv(process.env)), timeout: STATUS_TIMEOUT_MS }, (_err, out) =>
            resume(Effect.succeed(String(out ?? ""))),
          )
        })

      const status = (a: Account) =>
        runAuth(a.id, ["status", "--json"]).pipe(
          Effect.map((out): AuthState => parseAuthStatus(out)),
          Effect.map((s): AccountStatus => ({ id: a.id, label: a.label, ...s })),
        )

      const add = (label: string) =>
        Effect.gen(function* () {
          const current = yield* settings.get
          const account = { id: asAccountId(randomUUID()), label: uniqueLabel(current.accounts, label) }
          yield* settings.update({ accounts: [...current.accounts, account] })
          return account
        })

      const forget = (id: AccountId) =>
        Effect.gen(function* () {
          const dir = configDirFor(userData, id)
          if (!dir) {
            return
          }
          logins.cancel(id)
          yield* runAuth(id, ["logout"])
          yield* Effect.sync(() => fs.rmSync(dir, { recursive: true, force: true }))
        })

      return Accounts.of({
        list: settings.get.pipe(Effect.flatMap((s) => Effect.forEach(allAccounts(s.accounts), status, { concurrency: "unbounded" }))),
        add,
        childEnv: (id, base) => Effect.sync(() => envFor(id, base)),
        configDir: (id) => Effect.sync(() => prepare(id)),
        configHome: (id) => configHomeFor(home, userData, id),
        login: (id) => Effect.sync(() => logins.start(id, envFor(id, cleanEnv(process.env)))),
        loginCode: (id, code) => Effect.sync(() => logins.submitCode(id, code)),
        cancelLogin: (id) => Effect.sync(() => logins.cancel(id)),
        forget,
      })
    }),
  )
}
