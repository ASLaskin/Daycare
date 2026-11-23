// Worker launches waiting on the user, raised by the hub itself.

import { randomUUID } from "node:crypto"
import type { ChatEvent } from "../shared/chat.ts"
import type { Approval } from "../shared/coordinator.ts"
import { asRequestId, type RequestId, type SessionId } from "../shared/ids.ts"
import { chosenSpawn, SPAWN_APPROVAL_TOOL, type SpawnApprovalInput, type SpawnChoice } from "../shared/spawnApproval.ts"
import type { Answer } from "./provider.ts"

const CHOICES = ["allow", "deny"]

export interface SpawnApprovalDeps {
  // Shows the approval to clients
  readonly raise: (approval: Approval) => void
  // Withdraws an abandoned approval
  readonly withdraw: (master: SessionId, request: RequestId) => void
}

const key = (master: SessionId, request: RequestId) => `${master} ${request}`

export const makeSpawnApprovals = (deps: SpawnApprovalDeps) => {
  // Settle takes null when denied or cancelled
  const pending = new Map<string, { readonly input: SpawnApprovalInput; readonly settle: (choice: SpawnChoice | null) => void }>()

  // The user's model and effort, or null when denied
  const ask = (master: SessionId, input: SpawnApprovalInput, signal: AbortSignal) =>
    new Promise<SpawnChoice | null>((resolve) => {
      const request = asRequestId(`daycare-spawn-${randomUUID()}`)
      const event: ChatEvent = {
        kind: "permission",
        requestId: request,
        toolUseId: null,
        name: SPAWN_APPROVAL_TOOL,
        title: `Start worker ${input.name}`,
        input,
        description: "",
        suggestions: [],
        requiresUserInteraction: true,
        choices: CHOICES,
      }
      const abandon = () => {
        if (pending.has(key(master, request))) {
          deps.withdraw(master, request)
          finish(null)
        }
      }
      const finish = (choice: SpawnChoice | null) => {
        pending.delete(key(master, request))
        signal.removeEventListener("abort", abandon)
        resolve(choice)
      }
      pending.set(key(master, request), { input, settle: finish })
      signal.addEventListener("abort", abandon)
      deps.raise({ session: master, request, choices: CHOICES, event })
    })

  // False when not a pending spawn approval or the choice was not offered
  const answer = (master: SessionId, request: RequestId, given: Answer) => {
    const found = pending.get(key(master, request))
    if (!found || !CHOICES.includes(given.choice)) {
      return false
    }
    found.settle(given.choice === "allow" ? chosenSpawn(found.input, given.updatedInput) : null)
    return true
  }

  // Resolves as denied after the hub withdrew it
  const cancel = (master: SessionId, request: RequestId) => pending.get(key(master, request))?.settle(null)

  const has = (master: SessionId, request: RequestId) => pending.has(key(master, request))

  return { ask, answer, cancel, has }
}

export type SpawnApprovals = ReturnType<typeof makeSpawnApprovals>
