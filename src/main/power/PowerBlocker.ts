// Holds the system awake while work runs.

import { Context } from "effect"

export class PowerBlocker extends Context.Service<
  PowerBlocker,
  {
    readonly start: () => number
    readonly stop: (id: number) => void
    readonly isStarted: (id: number) => boolean
  }
>()("daycare/PowerBlocker") {}
