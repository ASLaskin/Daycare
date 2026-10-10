// Chat events sent from main to the renderer.

import type { ChatImage } from "./images.ts"
import type { ClaudeSessionId, DirPath, RequestId, TaskId, ToolUseId } from "./ids.ts"
import type { Json, JsonObject } from "./json.ts"

export type ChatState = "running" | "idle"

export type TaskUsage = JsonObject

export type ChatEvent =
  | {
      readonly kind: "ready"
      readonly claudeSessionId: ClaudeSessionId | null
      readonly model: string | null
      readonly cwd: DirPath | null
      readonly tools: ReadonlyArray<string>
      readonly slashCommands: ReadonlyArray<string>
    }
  | { readonly kind: "state"; readonly state: ChatState }
  // Streaming text, later replaced by a text event
  | { readonly kind: "text-delta"; readonly block: string; readonly text: string }
  | { readonly kind: "text"; readonly block: string; readonly text: string }
  | { readonly kind: "thinking"; readonly block: string; readonly text: string; readonly tokens: number | null }
  | {
      readonly kind: "tool-start"
      readonly toolUseId: ToolUseId
      readonly name: string
      readonly title: string
      readonly input: Json
      readonly parentToolUseId: ToolUseId | null
    }
  | {
      readonly kind: "tool-end"
      readonly toolUseId: ToolUseId
      readonly isError: boolean
      readonly content: string
      readonly structured: Json | null
    }
  | {
      readonly kind: "task"
      readonly taskId: TaskId
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
      readonly requestId: RequestId
      readonly toolUseId: ToolUseId | null
      readonly name: string
      readonly title: string
      readonly input: Json
      readonly description: string
      readonly suggestions: ReadonlyArray<Json>
      // Prompts like AskUserQuestion and ExitPlanMode
      readonly requiresUserInteraction: boolean
    }
  | {
      readonly kind: "permission-resolved"
      readonly requestId: RequestId
      readonly allowed: boolean
      // Set when the CLI withdrew the prompt
      readonly reason?: "cancelled"
    }
  | {
      readonly kind: "user"
      readonly text: string
      readonly images: ReadonlyArray<ChatImage>
      // Images left out of history to bound its size
      readonly omittedImages: number
    }
  | { readonly kind: "rate-limit"; readonly percent: number }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "exit"; readonly code: number | null; readonly stderrTail: string }

export type ChatEventOf<K extends ChatEvent["kind"]> = Extract<ChatEvent, { readonly kind: K }>
