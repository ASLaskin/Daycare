// Claude accounts, each its own Claude Code config dir.

import { Schema } from "effect"
import { AccountId, asAccountId } from "./ids.ts"

export const DEFAULT_ACCOUNT = asAccountId("default")

export const Account = Schema.Struct({ id: AccountId, label: Schema.String })
export type Account = typeof Account.Type

export const defaultAccount: Account = { id: DEFAULT_ACCOUNT, label: "Default" }

interface AccountChoice {
  readonly accounts: ReadonlyArray<Account>
  readonly activeAccount: AccountId
}

// Default first, then the added ones
export const allAccounts = (added: ReadonlyArray<Account>): ReadonlyArray<Account> => [
  defaultAccount,
  ...added.filter((a) => a.id !== DEFAULT_ACCOUNT),
]

export const hasAccount = (added: ReadonlyArray<Account>, id: AccountId) => allAccounts(added).some((a) => a.id === id)

// Active account, falling back to Default when it was removed
export const activeAccountOf = (s: AccountChoice): AccountId => (hasAccount(s.accounts, s.activeAccount) ? s.activeAccount : DEFAULT_ACCOUNT)

export const accountLabel = (added: ReadonlyArray<Account>, id: AccountId) =>
  allAccounts(added).find((a) => a.id === id)?.label ?? defaultAccount.label

// Label trimmed, unique among the existing ones
export const uniqueLabel = (added: ReadonlyArray<Account>, wanted: string) => {
  const base = wanted.trim() || "Account"
  const taken = new Set(allAccounts(added).map((a) => a.label.toLowerCase()))
  if (!taken.has(base.toLowerCase())) {
    return base
  }
  let n = 2
  while (taken.has(`${base} ${n}`.toLowerCase())) {
    n++
  }
  return `${base} ${n}`
}

// Account plus its Claude Code sign in state
export interface AccountStatus {
  readonly id: AccountId
  readonly label: string
  readonly loggedIn: boolean
  readonly email: string | null
}

export const LoginPhase = Schema.Literals(["waiting", "done", "failed"])
export type LoginPhase = typeof LoginPhase.Type

// Progress of a claude auth login run
export interface LoginProgress {
  readonly id: AccountId
  readonly phase: LoginPhase
  readonly url: string | null
  readonly message: string
}

export const LoginCode = Schema.Struct({ id: AccountId, code: Schema.String })
