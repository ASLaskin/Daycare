// Codex app-server notifications as Daycare chat events.

import { Result, Schema } from "effect"
import type { ChatEvent } from "../shared/chat.ts"
import { asToolUseId } from "../shared/ids.ts"
import { type Json, obj, str } from "../shared/json.ts"

const Optional = <S extends Schema.Top>(s: S) => Schema.optionalKey(Schema.NullOr(s))

const Item = Schema.Union([
  Schema.Struct({ type: Schema.Literal("agentMessage"), id: Schema.String, text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("reasoning"), id: Schema.String, summary: Optional(Schema.Array(Schema.String)) }),
  Schema.Struct({
    type: Schema.Literal("commandExecution"),
    id: Schema.String,
    command: Schema.String,
    status: Schema.String,
    aggregatedOutput: Optional(Schema.String),
    exitCode: Optional(Schema.Number),
  }),
  Schema.Struct({ type: Schema.Literal("fileChange"), id: Schema.String, changes: Schema.Json, status: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("mcpToolCall"),
    id: Schema.String,
    server: Schema.String,
    tool: Schema.String,
    arguments: Schema.Json,
    result: Optional(Schema.Json),
    error: Optional(Schema.Json),
  }),
  Schema.Struct({ type: Schema.Literal("webSearch"), id: Schema.String, query: Schema.String }),
])
type Item = typeof Item.Type

const KNOWN = new Set<string>(["agentMessage", "reasoning", "commandExecution", "fileChange", "mcpToolCall", "webSearch"])

const Delta = Schema.Struct({ itemId: Schema.String, delta: Schema.String })

const TurnCompleted = Schema.Struct({
  turn: Schema.Struct({
    status: Schema.String,
    durationMs: Optional(Schema.Number),
    error: Optional(Schema.Struct({ message: Schema.String })),
  }),
})

type Events = Result.Result<ReadonlyArray<ChatEvent>, string>

const decode = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, method: string, value: Json | undefined): Result.Result<S["Type"], string> =>
  Result.mapError(Schema.decodeUnknownResult(schema)(value), (e) => `${method}: ${e.message}`)

const toolStart = (id: string, name: string, title: string, input: Json): ChatEvent => ({
  kind: "tool-start",
  toolUseId: asToolUseId(id),
  name,
  title,
  input,
  parentToolUseId: null,
})

const toolEnd = (id: string, isError: boolean, content: string): ChatEvent => ({
  kind: "tool-end",
  toolUseId: asToolUseId(id),
  isError,
  content,
  structured: null,
})

const started = (item: Item): ReadonlyArray<ChatEvent> => {
  switch (item.type) {
    case "commandExecution":
      return [toolStart(item.id, "Bash", item.command, { command: item.command })]
    case "fileChange":
      return [toolStart(item.id, "Edit", "Edit files", { changes: item.changes })]
    case "mcpToolCall":
      return [toolStart(item.id, `mcp__${item.server}__${item.tool}`, item.tool, item.arguments)]
    case "webSearch":
      return [toolStart(item.id, "WebSearch", item.query, { query: item.query })]
    case "agentMessage":
    case "reasoning":
      return []
  }
}

const completed = (item: Item): ReadonlyArray<ChatEvent> => {
  switch (item.type) {
    case "agentMessage":
      return [{ kind: "text", block: item.id, text: item.text }]
    case "reasoning":
      return [{ kind: "thinking", block: item.id, text: (item.summary ?? []).join("\n"), tokens: null }]
    case "commandExecution": {
      const failed = item.status !== "completed" || (item.exitCode != null && item.exitCode !== 0)
      return [toolEnd(item.id, failed, item.aggregatedOutput ?? "")]
    }
    case "fileChange":
      return [toolEnd(item.id, item.status !== "completed", item.status)]
    case "mcpToolCall": {
      const outcome = item.error ?? item.result
      return [toolEnd(item.id, item.error != null, outcome == null ? "" : JSON.stringify(outcome))]
    }
    case "webSearch":
      return [toolEnd(item.id, false, "")]
  }
}

// Events for one item notification; unknown item types are ignored
const itemEvents = (method: string, params: Json | undefined, map: (item: Item) => ReadonlyArray<ChatEvent>): Events => {
  const raw = obj(params)?.["item"]
  if (!KNOWN.has(str(obj(raw)?.["type"]) ?? "")) {
    return Result.succeed([])
  }
  return Result.map(decode(Item, method, raw), map)
}

// Chat events for one notification; malformed required data is an error
export const codexEvents = (method: string, params: Json | undefined): Events => {
  switch (method) {
    case "item/agentMessage/delta":
      return Result.map(decode(Delta, method, params), (d): ReadonlyArray<ChatEvent> => [{ kind: "text-delta", block: d.itemId, text: d.delta }])
    case "turn/started":
      return Result.succeed([{ kind: "state", state: "running" }])
    case "item/started":
      return itemEvents(method, params, started)
    case "item/completed":
      return itemEvents(method, params, completed)
    case "turn/completed":
      return Result.map(decode(TurnCompleted, method, params), ({ turn }): ReadonlyArray<ChatEvent> => [
        {
          kind: "turn-end",
          isError: turn.status === "failed",
          stopReason: turn.status,
          costUsd: 0,
          contextTokens: 0,
          numTurns: null,
          durationMs: turn.durationMs ?? null,
          text: turn.error?.message ?? "",
        },
        { kind: "state", state: "idle" },
      ])
    default:
      return Result.succeed([])
  }
}
