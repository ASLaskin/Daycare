// Events main normalizes stream-json into.

export type ChatState = "running" | "idle"

export interface TaskUsage {
  readonly [key: string]: unknown
}

export type ChatEvent =
  | {
      readonly kind: "ready"
      readonly claudeSessionId: string | null
      readonly model: string | null
      readonly cwd: string | null
      readonly tools: ReadonlyArray<string>
      readonly slashCommands: ReadonlyArray<string>
    }
  | { readonly kind: "state"; readonly state: ChatState }
  // Superseded by the final text event.
  | { readonly kind: "text-delta"; readonly block: string; readonly text: string }
  | { readonly kind: "text"; readonly block: string; readonly text: string }
  | { readonly kind: "thinking"; readonly block: string; readonly text: string; readonly tokens: number | null }
  | {
      readonly kind: "tool-start"
      readonly toolUseId: string
      readonly name: string
      readonly title: string
      readonly input: unknown
      readonly parentToolUseId: string | null
    }
  | {
      readonly kind: "tool-end"
      readonly toolUseId: string
      readonly isError: boolean
      readonly content: string
      readonly structured: unknown
    }
  | {
      readonly kind: "task"
      readonly taskId: string
      readonly status: string
      readonly description: string
      readonly subagentType: string | null
      readonly summary: string
      readonly lastTool: string | null
      readonly usage: TaskUsage | null
    }
  | {
      readonly kind: "turn-end"
      readonly isError: boolean
      readonly stopReason: string | null
      readonly costUsd: number
      readonly contextTokens: number
      readonly numTurns: number | null
      readonly durationMs: number | null
      readonly text: string
    }
  | {
      readonly kind: "permission"
      readonly requestId: string
      readonly toolUseId: string | null
      readonly name: string
      readonly title: string
      readonly input: unknown
      readonly description: string
      readonly suggestions: ReadonlyArray<unknown>
      // Tools whose answer is the point.
      readonly requiresUserInteraction: boolean
    }
  | {
      readonly kind: "permission-resolved"
      readonly requestId: string
      readonly allowed: boolean
      // CLI withdrew it; user did not refuse.
      readonly reason?: "cancelled"
    }
  | { readonly kind: "user"; readonly text: string }
  | { readonly kind: "rate-limit"; readonly percent: number }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "exit"; readonly code: number | null; readonly stderrTail: string }

export type ChatEventOf<K extends ChatEvent["kind"]> = Extract<ChatEvent, { readonly kind: K }>
