// Local HTTP server for hooks and the master's MCP tools.

import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { asSessionId, type SessionId } from "../../shared/ids.ts"
import { type Json, parseJson } from "../../shared/json.ts"
import { ControlHandlers } from "./ControlHandlers.ts"
import { HookPayload, TOKEN_HEADER } from "./hook.ts"
import { handleMessage } from "./mcp.ts"

export class ControlEndpoint extends Context.Service<ControlEndpoint, { readonly url: string; readonly token: string }>()(
  "daycare/ControlEndpoint",
) {
  static readonly layer = Layer.effect(
    ControlEndpoint,
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer
      const address = server.address
      if (address._tag !== "InetAddressV4") {
        return yield* Effect.die("the control server must listen on 127.0.0.1")
      }
      return ControlEndpoint.of({ url: `http://127.0.0.1:${address.port}`, token: randomBytes(24).toString("hex") })
    }),
  )
}

const forbidden = HttpServerResponse.empty({ status: 403 })

const Routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const { token } = yield* ControlEndpoint
    const handlers = yield* ControlHandlers

    const guarded =
      (f: (id: SessionId, body: Json) => Effect.Effect<HttpServerResponse.HttpServerResponse>) =>
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (request.headers[TOKEN_HEADER] !== token) {
            return forbidden
          }
          const { id } = yield* HttpRouter.params
          const text = yield* request.text.pipe(Effect.orElseSucceed(() => ""))
          return yield* f(asSessionId(id ?? ""), parseJson(text))
        })

    // Hooks always get 200, even on bad input
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
        handleMessage(body, (call) => handlers.tool(id, call)).pipe(
          Effect.map((response) => (response ? HttpServerResponse.jsonUnsafe(response) : HttpServerResponse.empty({ status: 202 }))),
        ),
      ),
    )

    // No server streams or MCP sessions
    yield* router.add("GET", "/mcp/:id", HttpServerResponse.empty({ status: 405 }))
    yield* router.add("DELETE", "/mcp/:id", HttpServerResponse.empty({ status: 405 }))
  }),
)

// Loopback server on a free port
export const ControlHttpServer = NodeHttpServer.layer(createServer, { port: 0, host: "127.0.0.1" })

// Routes, built once ControlHandlers exists
export const ControlRoutes = HttpRouter.serve(Routes, { disableLogger: true, disableListenLog: true })
