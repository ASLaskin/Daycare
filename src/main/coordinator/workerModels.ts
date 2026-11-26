// Syncs worker model, effort, subagent and Code Mode settings to the coordinator.

import { Effect, Stream } from "effect"
import type { AgentOptions, Command, WorkerEfforts, WorkerModels } from "../../shared/coordinator.ts"
import type { Json } from "../../shared/json.ts"
import type { Settings } from "../../shared/settings.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"

interface WorkerConfig {
  readonly workerModels: WorkerModels
  readonly workerEfforts: WorkerEfforts
  readonly agentOptions: AgentOptions
}

const workerConfigOf = (s: Settings): WorkerConfig => ({
  workerModels: { workerModel: s.workerModel, autoWorkerModel: s.autoWorkerModel },
  workerEfforts: { workerEffort: s.workerEffort, autoWorkerEffort: s.autoWorkerEffort },
  agentOptions: { confirmSubagents: s.confirmSubagents, codeMode: s.codeMode },
})

const same = (a: WorkerConfig, b: WorkerConfig) =>
  a.workerModels.workerModel === b.workerModels.workerModel &&
  a.workerModels.autoWorkerModel === b.workerModels.autoWorkerModel &&
  a.workerEfforts.workerEffort === b.workerEfforts.workerEffort &&
  a.workerEfforts.autoWorkerEffort === b.workerEfforts.autoWorkerEffort &&
  a.agentOptions.confirmSubagents === b.agentOptions.confirmSubagents &&
  a.agentOptions.codeMode === b.agentOptions.codeMode

export const makeWorkerModelsSync = (settings: SettingsStore["Service"], send: (command: Command) => Promise<Json>) => {
  // Dropped while disconnected; connecting pushes again
  const push = (config: WorkerConfig) => Effect.tryPromise(() => send({ method: "configure", ...config })).pipe(Effect.ignore)

  return {
    pushCurrent: settings.get.pipe(Effect.flatMap((s) => push(workerConfigOf(s)))),
    follow: settings.changes.pipe(
      Effect.flatMap((changes) => changes.pipe(Stream.map(workerConfigOf), Stream.changesWith(same), Stream.runForEach(push))),
      Effect.forkScoped,
    ),
  }
}
