// Commands to and updates from one running provider.

import type { ChatEvent } from "../shared/chat.ts"
import type { NativeId } from "../shared/coordinator.ts"
import type { RequestId } from "../shared/ids.ts"
import type { Json } from "../shared/json.ts"

export type ProviderUpdate =
  | { readonly type: "event"; readonly event: ChatEvent }
  // Provider-chosen native id; stored before update returns
  | { readonly type: "native"; readonly nativeId: NativeId }
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
  // Resolves once the provider has taken the input; rejects if it refused it
  readonly input: (text: string) => Promise<void>
  readonly interrupt: () => void
  // False unless the request is pending and the choice was offered
  readonly answer: (request: RequestId, answer: Answer) => boolean
  // Resolves once the provider and its process group are gone
  readonly close: () => Promise<void>
}

// Input that definitely did not reach the provider
export class Refused extends Error {}
