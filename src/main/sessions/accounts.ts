// Account actions over in-app sessions.

import { Effect } from "effect"
import { type AccountActions, makeAccountActions } from "../accounts/actions.ts"
import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import { makeMover } from "./move.ts"

export const makeSessionAccountActions = (core: Core, lifecycle: Lifecycle): AccountActions => {
  const moveSession = makeMover(core)
  return makeAccountActions(core.deps, {
    all: () => [...core.sessions.values()],
    isRunning: core.isRunning,
    restart: (running, to) =>
      Effect.sync(() =>
        running.forEach((s) => {
          s.restartOn = to
          lifecycle.killSession(s)
        }),
      ),
    move: (stopped, to) =>
      Effect.sync(() => {
        stopped.forEach((s) => moveSession(s, to))
        core.persist()
        stopped.forEach(core.update)
      }),
  })
}
