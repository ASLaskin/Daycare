// Stateless MCP JSON-RPC handling for the master's tools.

import { Effect, Option, Schema } from "effect"
import { at, type Json, str } from "../../shared/json.ts"
import { isToolName, type ToolCall, toolList, Tools } from "./tools.ts"

export class ToolError extends Schema.TaggedError<ToolError>()("ToolError", { message: Schema.String }) {}

const RpcId = Schema.Union([Schema.String, Schema.Number])
type RpcId = typeof RpcId.Type

const RpcRequest = Schema.Struct({
  id: Schema.optionalKey(RpcId),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Json),
})
type RpcRequest = typeof RpcRequest.Type

const decodeRequest = Schema.decodeUnknownOption(RpcRequest)

const PROTOCOL_VERSION = "2025-06-18"

const result = (id: RpcId, value: Json) => ({ jsonrpc: "2.0" as const, id, result: value })
const failure = (id: RpcId | null, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } })
const text = (value: Json, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
})

// Decode a tool call into ToolError on bad input
const decodeCall = (name: string, args: Json | undefined): Effect.Effect<ToolCall, ToolError> => {
  if (!isToolName(name)) {
    return Effect.fail(new ToolError({ message: `Unknown tool ${name}` }))
  }
  return Schema.decodeUnknownEffect(Tools[name].input as Schema.Codec<ToolCall["input"]>)(args ?? {}).pipe(
    Effect.map((input) => ({ name, input }) as ToolCall),
    Effect.mapError((issue) => new ToolError({ message: `Bad arguments for ${name}: ${issue.message}` })),
  )
}

// Response for a request, null for a notification
export const handleMessage = <R>(
  body: Json,
  call: (tool: ToolCall) => Effect.Effect<Json, ToolError, R>,
): Effect.Effect<object | null, never, R> => {
  const decoded = decodeRequest(body)
  if (Option.isNone(decoded)) {
    return Effect.succeed(failure(null, -32600, "Invalid request"))
  }
  return respond(decoded.value, call)
}

const respond = <R>(msg: RpcRequest, call: (tool: ToolCall) => Effect.Effect<Json, ToolError, R>): Effect.Effect<object | null, never, R> => {
  if (msg.id === undefined) {
    return Effect.succeed(null)
  }
  const id = msg.id
  switch (msg.method) {
    case "initialize":
      return Effect.succeed(
        result(id, {
          protocolVersion: str(at(msg.params, "protocolVersion")) || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "daycare", version: "0.2.0" },
        }),
      )
    case "ping":
      return Effect.succeed(result(id, {}))
    case "tools/list":
      return Effect.succeed(result(id, { tools: toolList }))
    case "tools/call":
      return decodeCall(String(at(msg.params, "name")), at(msg.params, "arguments")).pipe(
        Effect.flatMap(call),
        Effect.map((value) => result(id, text(value))),
        Effect.catchTag("ToolError", (e) => Effect.succeed(result(id, text(e.message, true)))),
      )
    default:
      return Effect.succeed(failure(id, -32601, `Method not found: ${msg.method}`))
  }
}
