// Effort a new worker launches with.

import { SAME_AS_MASTER } from "../../shared/models.ts"
import type { Settings } from "../../shared/settings.ts"

// Auto pick effort when the master names none
const AUTO_DEFAULT_EFFORT = "medium"

type EffortSettings = Pick<Settings, "workerEffort" | "autoWorkerEffort">

export const workerEffort = (settings: EffortSettings, masterEffort: string, requested: string | undefined) => {
  if (settings.autoWorkerEffort) {
    return requested || AUTO_DEFAULT_EFFORT
  }
  if (settings.workerEffort === SAME_AS_MASTER.id) {
    return masterEffort
  }
  return settings.workerEffort
}
