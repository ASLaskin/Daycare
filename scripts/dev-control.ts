// Dev only: control server alone, writes an MCP config.

import { Effect, Layer } from "effect"
import fs from "node:fs"
import { ControlHandlers } from "../src/main/control/ControlHandlers.ts"
import { ControlEndpoint, ControlHttpServer, ControlRoutes } from "../src/main/control/ControlServer.ts"

const Logging = Layer.succeed(
  ControlHandlers,
  ControlHandlers.of({
    hook: (id, payload) => Effect.log(`hook ${id} ${payload.hook_event_name}`),
    tool: (id, call) => Effect.log(`tool ${id} ${call.name}`).pipe(Effect.as({ ok: true })),
  }),
)

const program = Effect.gen(function* () {
  const { url, token } = yield* ControlEndpoint
  const config = { mcpServers: { daycare: { type: "http", url: `${url}/mcp/dev`, headers: { "x-daycare-token": token }, timeout: 1800000 } } }
  fs.writeFileSync(process.argv[2]!, JSON.stringify(config), { mode: 0o600 })
  yield* Effect.log(`listening on ${url}`)
  return yield* Effect.never
})

Effect.runFork(program.pipe(Effect.provide(ControlRoutes.pipe(Layer.provideMerge(ControlEndpoint.layer), Layer.provide(Logging), Layer.provide(ControlHttpServer)))))
