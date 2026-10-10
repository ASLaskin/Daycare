// The stdio MCP bridge against a real coordinator socket.

import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import pkg from "../package.json" with { type: "json" }
import { makeHub } from "../src/coordinator/hub.ts"
import { listen } from "../src/coordinator/server.ts"
import { createSession } from "../src/coordinator/store.ts"
import { asNativeId } from "../src/shared/coordinator.ts"
import { type Json, obj, parseJson } from "../src/shared/json.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const BRIDGE = path.join(import.meta.dir, "..", "src", "coordinator", "mcp.ts")
const cleanup: Array<() => unknown> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()))
})

const runtimeDir = () => {
  const runtime = path.join(mkdtempSync(path.join(tmpdir(), "daycare-mcp-")), "daycare")
  cleanup.push(() => rmSync(path.dirname(runtime), { recursive: true, force: true }))
  return runtime
}

const coordinator = async () => {
  const runtime = runtimeDir()
  const db = tempDb()
  const conn = db.open()
  createSession(conn, { ...sample("m", "claude", "idle"), nativeId: asNativeId("n") })
  const hub = makeHub(conn, () => ({ input: async () => {}, interrupt: () => {}, answer: () => false, close: async () => {} }))
  const server = await listen(runtime, () => hub, pkg.version)
  cleanup.push(() => server.close(), () => db.remove())
  return runtime
}

// Bridge child process speaking JSON-RPC lines
const bridge = (runtime: string) => {
  const child = Bun.spawn([process.execPath, BRIDGE, "m"], { stdin: "pipe", stdout: "pipe", env: { ...process.env, DAYCARE_RUNTIME_DIR: runtime } })
  cleanup.push(() => child.kill())
  const replies = new Map<Json, Record<string, Json>>()
  void (async () => {
    let pending = ""
    for await (const chunk of child.stdout) {
      const parts = (pending + new TextDecoder().decode(chunk)).split("\n")
      pending = parts.pop() ?? ""
      parts.filter(Boolean).forEach((l) => {
        const msg = obj(parseJson(l))
        if (msg) {
          replies.set(msg["id"] ?? null, msg)
        }
      })
    }
  })()
  let id = 0
  const rpc = async (method: string, params: Json = {}) => {
    id += 1
    const mine = id
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`)
    child.stdin.flush()
    const deadline = Date.now() + 5000
    while (!replies.has(mine) && Date.now() < deadline) {
      await Bun.sleep(10)
    }
    return replies.get(mine) ?? {}
  }
  const toolText = async (name: string, args: Json) => {
    const r = obj((await rpc("tools/call", { name, arguments: args }))["result"])
    const content = (r?.["content"] as ReadonlyArray<{ text: string }> | undefined)?.[0]?.text ?? ""
    return { isError: r?.["isError"] === true, text: content }
  }
  return { child, rpc, toolText }
}

test("the bridge serves the tool list and relays calls to the coordinator", async () => {
  const runtime = await coordinator()
  const { rpc, toolText } = bridge(runtime)
  expect(obj((await rpc("initialize", { protocolVersion: "2025-06-18" }))["result"])?.["protocolVersion"]).toBe("2025-06-18")
  const tools = obj((await rpc("tools/list"))["result"])?.["tools"] as ReadonlyArray<{ name: string }>
  expect(tools.map((t) => t.name).sort()).toEqual(["list_subagents", "read_subagent", "send_to_subagent", "spawn_subagent", "wait_for_subagents"])
  const spawned = await toolText("spawn_subagent", { name: "w", task: "go" })
  expect(spawned.isError).toBe(false)
  expect(obj(parseJson(spawned.text))?.["delivered"]).toBe("provider")
  const listed = await toolText("list_subagents", {})
  expect((parseJson(listed.text) as ReadonlyArray<{ name: string }>).map((w) => w.name)).toEqual(["w"])
  expect(await toolText("read_subagent", { worker: "nobody" })).toEqual({ isError: true, text: 'no worker "nobody"; known workers: w' })
  expect(obj((await rpc("resources/list"))["error"])?.["code"]).toBe(-32601)
})

test("without a coordinator, calls fail as tool errors and the bridge stays up", async () => {
  const { rpc, toolText } = bridge(runtimeDir())
  const r = await toolText("list_subagents", {})
  expect(r.isError).toBe(true)
  expect(r.text).toStartWith("coordinator unavailable:")
  expect(obj((await rpc("ping"))["result"])).toEqual({})
})

test("the bridge exits once its stdin closes", async () => {
  const runtime = await coordinator()
  const { child, toolText } = bridge(runtime)
  await toolText("list_subagents", {})
  child.stdin.end()
  const code = await Promise.race([child.exited, Bun.sleep(3000).then(() => "still running")])
  expect(code).toBe(0)
})
