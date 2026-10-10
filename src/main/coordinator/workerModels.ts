// Keeps the coordinator's subagent model settings in step with the app's.

import { Effect, Stream } from "effect"
import type { Command, WorkerModels } from "../../shared/coordinator.ts"
import type { Json } from "../../shared/json.ts"
import type { Settings } from "../../shared/settings.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"

const workerModelsOf = (s: Settings): WorkerModels => ({ workerModel: s.workerModel, autoWorkerModel: s.autoWorkerModel })

const same = (a: WorkerModels, b: WorkerModels) => a.workerModel === b.workerModel && a.autoWorkerModel === b.autoWorkerModel

export const makeWorkerModelsSync = (settings: SettingsStore["Service"], send: (command: Command) => Promise<Json>) => {
  // Dropped while disconnected; connecting pushes again
  const push = (workerModels: WorkerModels) => Effect.tryPromise(() => send({ method: "configure", workerModels })).pipe(Effect.ignore)

  return {
    pushCurrent: settings.get.pipe(Effect.flatMap((s) => push(workerModelsOf(s)))),
    follow: settings.changes.pipe(
      Effect.flatMap((changes) => changes.pipe(Stream.map(workerModelsOf), Stream.changesWith(same), Stream.runForEach(push))),
      Effect.forkScoped,
    ),
  }
}
