// Model a new worker launches with.

import { SAME_AS_MASTER } from "../../shared/models.ts"
import type { Settings } from "../../shared/settings.ts"

type ModelSettings = Pick<Settings, "workerModel" | "autoWorkerModel">

export const workerModel = (settings: ModelSettings, masterModel: string, requested: string | undefined) => {
  if (settings.autoWorkerModel) {
    return requested || masterModel
  }
  if (settings.workerModel === SAME_AS_MASTER.id) {
    return masterModel
  }
  return settings.workerModel
}
