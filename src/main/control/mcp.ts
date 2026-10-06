// Stateless; the URL identifies the master.

import { Effect, Schema } from "effect"
import { isToolName, type ToolCall, toolList, Tools } from "./tools.ts"

export class ToolError extends Schema.TaggedError<ToolError>()("ToolError", { message: Schema.String }) {}

type RpcId = string | number
interface RpcRequest {
  readonly jsonrpc: "2.0"
  readonly id?: RpcId
  readonly method: string
  readonly params?: any
}

const PROTOCOL_VERSION = "2025-06-18"

const result = (id: RpcId, value: unknown) => ({ jsonrpc: "2.0" as const, id, result: value })
const failure = (id: RpcId | null, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } })
const text = (value: unknown, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
})

// Bad arguments go back as readable errors.
const decodeCall = (name: string, args: unknown): Effect.Effect<ToolCall, ToolError> => {
  if (!isToolName(name)) return Effect.fail(new ToolError({ message: `Unknown tool ${name}` }))
  return Schema.decodeUnknownEffect(Tools[name].input as Schema.Codec<unknown>)(args ?? {}).pipe(
    Effect.map((input) => ({ name, input }) as ToolCall),
    Effect.mapError((issue) => new ToolError({ message: `Bad arguments for ${name}: ${issue.message}` })),
  )
}

// Null for a notification (answered 202).
export const handleMessage = <R>(
  msg: RpcRequest,
  call: (tool: ToolCall) => Effect.Effect<unknown, ToolError, R>,
): Effect.Effect<object | null, never, R> => {
  if (msg.id === undefined) return Effect.succeed(null)
  const id = msg.id
  switch (msg.method) {
    case "initialize":
      return Effect.succeed(
        result(id, {
          protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "daycare", version: "0.2.0" },
        }),
      )
    case "ping":
      return Effect.succeed(result(id, {}))
    case "tools/list":
      return Effect.succeed(result(id, { tools: toolList }))
    case "tools/call":
      return decodeCall(String(msg.params?.name), msg.params?.arguments).pipe(
        Effect.flatMap(call),
        Effect.map((value) => result(id, text(value))),
        Effect.catchTag("ToolError", (e) => Effect.succeed(result(id, text(e.message, true)))),
      )
    default:
      return Effect.succeed(failure(id, -32601, `Method not found: ${msg.method}`))
  }
}
