// Points a stopped session at another account.

import type { AccountId } from "../../shared/ids.ts"
import { copyTranscript } from "../accounts/relocate.ts"
import type { Core } from "./core.ts"
import type { Session } from "./model.ts"

// Carries the transcript along; without one it starts fresh
export const makeMover = (core: Core) => (s: Session, to: AccountId) => {
  if (s.accountId === to) {
    return
  }
  const { configHome } = core.deps.accounts
  const from = s.transcriptPath
  try {
    s.transcriptPath = from ? copyTranscript(from, configHome(s.accountId), configHome(to)) : null
  } catch {
    s.transcriptPath = null
  }
  s.accountId = to
}
