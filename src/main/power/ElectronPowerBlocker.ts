// The real PowerBlocker. 'prevent-app-suspension' stops idle sleep but lets the
// display turn off, which is all a running session needs.

import { powerSaveBlocker } from "electron"
import { Layer } from "effect"
import { PowerBlocker } from "./Power.ts"

export const ElectronPowerBlocker = Layer.succeed(
  PowerBlocker,
  PowerBlocker.of({
    start: () => powerSaveBlocker.start("prevent-app-suspension"),
    stop: (id) => powerSaveBlocker.stop(id),
    isStarted: (id) => powerSaveBlocker.isStarted(id),
  }),
)
