// Model a new worker launches with.

import { SAME_AS_MASTER } from "../../shared/models.ts"
import type { Settings } from "../../shared/settings.ts"

// Auto pick model when the master names none
const AUTO_DEFAULT_MODEL = "opus"

type ModelSettings = Pick<Settings, "workerModel" | "autoWorkerModel">

export const workerModel = (settings: ModelSettings, masterModel: string, requested: string | undefined) => {
  if (settings.autoWorkerModel) {
    return requested || AUTO_DEFAULT_MODEL
  }
  if (settings.workerModel === SAME_AS_MASTER.id) {
    return masterModel
  }
  return settings.workerModel
}
