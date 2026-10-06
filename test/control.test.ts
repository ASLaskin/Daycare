// The control server over real loopback HTTP, with fake handlers behind it.

import { afterAll, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { ControlEndpoint, ControlHandlers, ControlHttpServer, ControlRoutes, type HookPayload, TOKEN_HEADER } from "../src/main/control/ControlServer.ts"
import { ToolError } from "../src/main/control/mcp.ts"
import type { ToolCall } from "../src/main/control/tools.ts"

const hooks: Array<{ id: string; payload: HookPayload }> = []
const calls: Array<{ id: string; call: ToolCall }> = []

const FakeHandlers = Layer.succeed(
  ControlHandlers,
  ControlHandlers.of({
    hook: (id, payload) => Effect.sync(() => void hooks.push({ id, payload })),
    tool: (id, call) =>
      Effect.gen(function* () {
        calls.push({ id, call })
        if (call.name === "read_subagent") return yield* new ToolError({ message: `No worker "${call.input.worker}"` })
        return { ok: true }
      }),
  }),
)

const layer = ControlRoutes.pipe(
  Layer.provideMerge(ControlEndpoint.layer),
  Layer.provide(FakeHandlers),
  Layer.provide(ControlHttpServer),
)
const runtime = ManagedRuntime.make(layer)
const { url, token } = await runtime.runPromise(ControlEndpoint.use(Effect.succeed))
afterAll(() => runtime.dispose())

const post = (path: string, body: unknown, withToken = true) =>
  fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withToken ? { [TOKEN_HEADER]: token } : {}) },
    body: JSON.stringify(body),
  })
const rpc = async (body: unknown) => (await post("/mcp/m1", body)).json() as Promise<any>

test("listens on loopback", () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
})

test("a request without the token is refused", async () => {
  expect((await post("/hook/s1", { hook_event_name: "Stop" }, false)).status).toBe(403)
  expect(hooks.length).toBe(0)
})

test("a hook is decoded and answered with an empty 200", async () => {
  const res = await post("/hook/s1", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, extra: 1 })
  expect([res.status, await res.text()]).toEqual([200, ""])
  expect(hooks).toEqual([{ id: "s1", payload: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } } }])
})

test("a malformed hook is still a 200, so it never shows as a hook error", async () => {
  expect((await post("/hook/s1", { nope: true })).status).toBe(200)
  expect(hooks.length).toBe(1)
})

test("MCP initialize, ping and tools/list", async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })
  expect(init.result.serverInfo.name).toBe("daycare")
  expect((await rpc({ jsonrpc: "2.0", id: 2, method: "ping" })).result).toEqual({})
  const tools = (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result.tools
  expect(tools.map((t: any) => t.name)).toEqual(["spawn_subagent", "list_subagents", "wait_for_subagents", "read_subagent", "send_to_subagent"])
  expect(tools[0].inputSchema.required).toEqual(["name", "task"])
  expect(tools[2].inputSchema.properties.timeout_seconds.type).toBe("number")
})

test("a notification gets 202 and no body", async () => {
  const res = await post("/mcp/m1", { jsonrpc: "2.0", method: "notifications/initialized" })
  expect(res.status).toBe(202)
})

test("tools/call decodes arguments and reaches the handler", async () => {
  const ok = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "spawn_subagent", arguments: { name: "w", task: "t" } } })
  expect(ok.result.isError).toBeUndefined()
  expect(JSON.parse(ok.result.content[0].text)).toEqual({ ok: true })
  expect(calls.at(-1)).toEqual({ id: "m1", call: { name: "spawn_subagent", input: { name: "w", task: "t" } } })
})

test("bad arguments, unknown tools and handler errors come back as tool errors", async () => {
  const before = calls.length
  const bad = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "spawn_subagent", arguments: { name: 3 } } })
  expect(bad.result.isError).toBe(true)
  expect(bad.result.content[0].text).toContain("Bad arguments for spawn_subagent")
  const unknown = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "rm_rf", arguments: {} } })
  expect(unknown.result.content[0].text).toBe("Unknown tool rm_rf")
  expect(calls.length).toBe(before)
  const failed = await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_subagent", arguments: { worker: "x" } } })
  expect([failed.result.isError, failed.result.content[0].text]).toEqual([true, 'No worker "x"'])
})

test("unknown methods are JSON-RPC errors", async () => {
  expect((await rpc({ jsonrpc: "2.0", id: 8, method: "resources/list" })).error.code).toBe(-32601)
})
