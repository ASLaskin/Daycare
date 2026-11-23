// Spawn approvals shown in the master's chat.

import { Deferred, Effect } from "effect"
import { randomUUID } from "node:crypto"
import { asRequestId, type RequestId, type SessionId } from "../../shared/ids.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import { chosenSpawn, SPAWN_APPROVAL_TOOL, type SpawnApprovalInput, type SpawnChoice } from "../../shared/spawnApproval.ts"
import type { Core } from "./core.ts"
import type { Session } from "./model.ts"

interface Pending {
  readonly masterId: SessionId
  readonly input: SpawnApprovalInput
  // Null when denied
  readonly done: Deferred.Deferred<SpawnChoice | null>
}

export interface SpawnApproval {
  // The user's model and effort, or null when denied
  readonly ask: (master: Session, input: SpawnApprovalInput) => Effect.Effect<SpawnChoice | null>
  // False when requestId is not a pending spawn approval
  readonly answer: (masterId: SessionId, requestId: RequestId, decision: PermissionDecision) => boolean
}

export const makeSpawnApproval = (core: Core): SpawnApproval => {
  const { chat } = core.deps
  const pending = new Map<RequestId, Pending>()

  // Resolve once; a gone request is cancelled
  const settle = (requestId: RequestId, choice: SpawnChoice | null, cancelled: boolean) => {
    const p = pending.get(requestId)
    if (!p) {
      return false
    }
    pending.delete(requestId)
    core.run(chat.emit(p.masterId, [{ kind: "permission-resolved", requestId, allowed: choice !== null, ...(cancelled ? { reason: "cancelled" as const } : {}) }]))
    core.run(Deferred.succeed(p.done, choice))
    return true
  }

  const ask = (master: Session, input: SpawnApprovalInput) =>
    Effect.gen(function* () {
      const requestId = asRequestId(`daycare-spawn-${randomUUID()}`)
      const done = yield* Deferred.make<SpawnChoice | null>()
      pending.set(requestId, { masterId: master.id, input, done })
      yield* chat.emit(master.id, [
        {
          kind: "permission",
          requestId,
          toolUseId: null,
          name: SPAWN_APPROVAL_TOOL,
          title: `Start worker ${input.name}`,
          input,
          description: "",
          suggestions: [],
          requiresUserInteraction: true,
        },
      ])
      return yield* Deferred.await(done).pipe(Effect.ensuring(Effect.sync(() => settle(requestId, null, true))))
    })

  const answer = (masterId: SessionId, requestId: RequestId, decision: PermissionDecision) => {
    const p = pending.get(requestId)
    if (!p || p.masterId !== masterId) {
      return false
    }
    return settle(requestId, decision.allow ? chosenSpawn(p.input, decision.updatedInput) : null, false)
  }

  return { ask, answer }
}
