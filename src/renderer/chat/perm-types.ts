import type { ChatEventOf } from "../../shared/chat.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"

export type PermissionEvent = ChatEventOf<"permission">
export type Answer = (decision: PermissionDecision, allowed: boolean, label?: string) => void

// Longest answer string the CLI accepts
export const ANSWER_MAX = 8192

export interface CardParts {
  readonly ev: PermissionEvent
  readonly card: HTMLElement
  readonly buttons: Array<HTMLButtonElement>
  readonly answer: Answer
}
