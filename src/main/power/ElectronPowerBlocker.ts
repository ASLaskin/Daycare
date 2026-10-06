// PowerBlocker backed by Electron, display may still sleep.

import { powerSaveBlocker } from "electron"
import { Layer } from "effect"
import { PowerBlocker } from "./PowerBlocker.ts"

export const ElectronPowerBlocker = Layer.succeed(
  PowerBlocker,
  PowerBlocker.of({
    start: () => powerSaveBlocker.start("prevent-app-suspension"),
    stop: (id) => powerSaveBlocker.stop(id),
    isStarted: (id) => powerSaveBlocker.isStarted(id),
  }),
)
