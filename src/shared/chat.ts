// Chat events sent from main to the renderer.

import { Schema } from "effect"
import { ClaudeSessionId, DirPath, RequestId, TaskId, ToolUseId } from "./ids.ts"

export const ChatState = Schema.Literals(["running", "idle"])
export type ChatState = typeof ChatState.Type

export type TaskUsage = typeof Schema.JsonObject.Type

const event = <const K extends string, const F extends Schema.Struct.Fields>(kind: K, fields: F) =>
  Schema.Struct({ kind: Schema.Literal(kind), ...fields })

export const ChatEvent = Schema.Union([
  event("ready", {
    claudeSessionId: Schema.NullOr(ClaudeSessionId),
    model: Schema.NullOr(Schema.String),
    cwd: Schema.NullOr(DirPath),
    tools: Schema.Array(Schema.String),
    slashCommands: Schema.Array(Schema.String),
  }),
  event("state", { state: ChatState }),
  // Streaming text, later replaced by a text event
  event("text-delta", { block: Schema.String, text: Schema.String }),
  event("text", { block: Schema.String, text: Schema.String }),
  event("thinking", { block: Schema.String, text: Schema.String, tokens: Schema.NullOr(Schema.Number) }),
  event("tool-start", {
    toolUseId: ToolUseId,
    name: Schema.String,
    title: Schema.String,
    input: Schema.Json,
    parentToolUseId: Schema.NullOr(ToolUseId),
  }),
  event("tool-end", {
    toolUseId: ToolUseId,
    isError: Schema.Boolean,
    content: Schema.String,
    structured: Schema.NullOr(Schema.Json),
  }),
  event("task", {
    taskId: TaskId,
    status: Schema.String,
    description: Schema.String,
    subagentType: Schema.NullOr(Schema.String),
    summary: Schema.String,
    lastTool: Schema.NullOr(Schema.String),
    usage: Schema.NullOr(Schema.JsonObject),
  }),
  event("turn-end", {
    isError: Schema.Boolean,
    stopReason: Schema.NullOr(Schema.String),
    costUsd: Schema.Number,
    contextTokens: Schema.Number,
    numTurns: Schema.NullOr(Schema.Number),
    durationMs: Schema.NullOr(Schema.Number),
    text: Schema.String,
  }),
  event("permission", {
    requestId: RequestId,
    toolUseId: Schema.NullOr(ToolUseId),
    name: Schema.String,
    title: Schema.String,
    input: Schema.Json,
    description: Schema.String,
    suggestions: Schema.Array(Schema.Json),
    // Prompts like AskUserQuestion and ExitPlanMode
    requiresUserInteraction: Schema.Boolean,
  }),
  event("permission-resolved", {
    requestId: RequestId,
    allowed: Schema.Boolean,
    // Set when the CLI withdrew the prompt
    reason: Schema.optionalKey(Schema.Literal("cancelled")),
  }),
  event("user", { text: Schema.String }),
  event("rate-limit", { percent: Schema.Number }),
  event("error", { message: Schema.String }),
  // A turn in progress lost its provider; the session can continue on the next send
  event("interrupted", { reason: Schema.String }),
  // Informational line from Daycare, such as a weakened sandbox
  event("notice", { message: Schema.String }),
  event("exit", { code: Schema.NullOr(Schema.Number), stderrTail: Schema.String }),
  // Earlier history was discarded to stay within the retained limit
  event("history-evicted", {}),
  // Stored preview of an event too large to retain whole
  event("oversized", { original: Schema.String, bytes: Schema.Number, preview: Schema.String }),
])
export type ChatEvent = typeof ChatEvent.Type

export type ChatEventOf<K extends ChatEvent["kind"]> = Extract<ChatEvent, { readonly kind: K }>
