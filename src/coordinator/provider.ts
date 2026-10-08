// Commands to and updates from one running provider.

import type { ChatEvent } from "../shared/chat.ts"
import type { RequestId } from "../shared/ids.ts"
import type { Json } from "../shared/json.ts"

export type ProviderUpdate =
  | { readonly type: "event"; readonly event: ChatEvent }
  // Provider confirmed the saved native id
  | { readonly type: "created" }
  | { readonly type: "approval"; readonly request: RequestId; readonly choices: ReadonlyArray<string>; readonly event: ChatEvent }
  | { readonly type: "approval-gone"; readonly request: RequestId }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "exited" }

export interface Answer {
  readonly choice: string
  readonly message?: string
  readonly updatedInput?: Json
}

export interface ProviderHandle {
  readonly input: (text: string) => void
  readonly interrupt: () => void
  // False unless the request is pending and the choice was offered
  readonly answer: (request: RequestId, answer: Answer) => boolean
  // Resolves once the provider and its process group are gone
  readonly close: () => Promise<void>
}
