// Effort a new worker launches with.

import { SAME_AS_MASTER } from "../../shared/models.ts"
import type { Settings } from "../../shared/settings.ts"

type EffortSettings = Pick<Settings, "workerEffort" | "autoWorkerEffort">

export const workerEffort = (settings: EffortSettings, masterEffort: string, requested: string | undefined) => {
  if (settings.autoWorkerEffort) {
    return requested || masterEffort
  }
  if (settings.workerEffort === SAME_AS_MASTER.id) {
    return masterEffort
  }
  return settings.workerEffort
}
