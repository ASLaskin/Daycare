// The loopback HTTP server every Claude session talks back to. Two routes:
//
//   POST /hook/:id  Claude Code's own HTTP hooks (SessionStart, PreToolUse, ...).
//                   No process is spawned per hook, which matters because
//                   PreToolUse fires on every tool call.
//   POST /mcp/:id   The master's daycare tools, as an MCP server.
//
// `:id` is the Daycare session id. Every request must carry the per-launch
// token; sessions get it through their environment, never their argv.

import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { handleMessage, type ToolError } from "./mcp.ts"
import type { ToolCall } from "./tools.ts"

export const TOKEN_HEADER = "x-daycare-token"

// What a hook body carries that Daycare reads. Other fields are ignored.
export const HookPayload = Schema.Struct({
  hook_event_name: Schema.String,
  session_id: Schema.optionalKey(Schema.String),
  transcript_path: Schema.optionalKey(Schema.String),
  tool_name: Schema.optionalKey(Schema.String),
  tool_input: Schema.optionalKey(Schema.Unknown),
  message: Schema.optionalKey(Schema.String),
  last_assistant_message: Schema.optionalKey(Schema.String),
})
export type HookPayload = typeof HookPayload.Type

// Where sessions reach this server. Read by Sessions to build hook settings.
export class ControlEndpoint extends Context.Service<ControlEndpoint, { readonly url: string; readonly token: string }>()(
  "daycare/ControlEndpoint",
) {
  static readonly layer = Layer.effect(
    ControlEndpoint,
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer
      const address = server.address
      if (address._tag !== "InetAddressV4") return yield* Effect.die("the control server must listen on 127.0.0.1")
      return ControlEndpoint.of({ url: `http://127.0.0.1:${address.port}`, token: randomBytes(24).toString("hex") })
    }),
  )
}

// What the routes call into. Implemented by Sessions; kept as its own service
// so the server can be tested against a fake.
export class ControlHandlers extends Context.Service<
  ControlHandlers,
  {
    readonly hook: (id: string, payload: HookPayload) => Effect.Effect<void>
    readonly tool: (masterId: string, call: ToolCall) => Effect.Effect<unknown, ToolError>
  }
>()("daycare/ControlHandlers") {}

const forbidden = HttpServerResponse.empty({ status: 403 })

const Routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const { token } = yield* ControlEndpoint
    const handlers = yield* ControlHandlers

    // Wraps a handler with the token check and the :id lookup.
    const guarded =
      (f: (id: string, body: unknown) => Effect.Effect<HttpServerResponse.HttpServerResponse>) =>
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (request.headers[TOKEN_HEADER] !== token) return forbidden
          const { id } = yield* HttpRouter.params
          const body = yield* request.json.pipe(Effect.orElseSucceed(() => null))
          return yield* f(id ?? "", body)
        })

    // Always 200 with an empty body: Claude reads anything else as a hook error.
    yield* router.add(
      "POST",
      "/hook/:id",
      guarded((id, body) =>
        Schema.decodeUnknownEffect(HookPayload)(body).pipe(
          Effect.flatMap((payload) => handlers.hook(id, payload)),
          Effect.ignore,
          Effect.as(HttpServerResponse.empty({ status: 200 })),
        ),
      ),
    )

    yield* router.add(
      "POST",
      "/mcp/:id",
      guarded((id, body) =>
        handleMessage(body as any, (call) => handlers.tool(id, call)).pipe(
          Effect.map((response) => (response ? HttpServerResponse.jsonUnsafe(response) : HttpServerResponse.empty({ status: 202 }))),
        ),
      ),
    )

    // No server-initiated stream and no MCP sessions to end.
    yield* router.add("GET", "/mcp/:id", HttpServerResponse.empty({ status: 405 }))
    yield* router.add("DELETE", "/mcp/:id", HttpServerResponse.empty({ status: 405 }))
  }),
)

// The listening socket. Port 0 picks a free one; the endpoint reports which.
export const ControlHttpServer = NodeHttpServer.layer(createServer, { port: 0, host: "127.0.0.1" })

// Serving the routes. Needs ControlHandlers, so it is built after Sessions.
export const ControlRoutes = HttpRouter.serve(Routes, { disableLogger: true, disableListenLog: true })
