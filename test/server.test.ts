// Coordinator socket: ownership, permissions, handshake, ordering and slow clients.

import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import net from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { type Launch, makeHub } from "../src/coordinator/hub.ts"
import type { ProviderUpdate } from "../src/coordinator/provider.ts"
import { AlreadyRunning, listen, OUTBOX_LIMIT } from "../src/coordinator/server.ts"
import { socketPath } from "../src/shared/runtime.ts"
import { createSession } from "../src/coordinator/store.ts"
import { asNativeId } from "../src/shared/coordinator.ts"
import { asSessionId } from "../src/shared/ids.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const VERSION = "1.0.0"
const id = asSessionId("s")
const cleanup: Array<() => unknown> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()))
})

const setup = async (stallMs?: number) => {
  const runtime = path.join(mkdtempSync(path.join(tmpdir(), "daycare-run-")), "daycare")
  const db = tempDb()
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", "idle"), nativeId: asNativeId("n") })
  const updates: Array<(u: ProviderUpdate) => void> = []
  const launch: Launch = (_s, update) => {
    updates.push(update)
    return { input: async () => {}, interrupt: () => {}, answer: () => false, close: async () => {} }
  }
  const hub = makeHub(conn, launch)
  const server = await listen(runtime, () => hub, VERSION, stallMs)
  cleanup.push(() => server.close(), () => db.remove(), () => rmSync(path.dirname(runtime), { recursive: true, force: true }))
  return { runtime, hub, server, updates }
}

// Socket client collecting decoded lines
const connect = (runtime: string) => {
  const socket = net.createConnection(socketPath(runtime))
  const lines: Array<Record<string, unknown>> = []
  let pending = ""
  socket.setEncoding("utf8")
  socket.on("data", (chunk: string) => {
    const parts = (pending + chunk).split("\n")
    pending = parts.pop() ?? ""
    parts.filter(Boolean).forEach((l) => lines.push(JSON.parse(l)))
  })
  const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()))
  const waitFor = async (count: number) => {
    const deadline = Date.now() + 5000
    while (lines.length < count && Date.now() < deadline) {
      await Bun.sleep(5)
    }
    return lines
  }
  const send = (msg: object) => socket.write(`${JSON.stringify(msg)}\n`)
  cleanup.push(() => socket.destroy())
  return { socket, lines, waitFor, send, closed }
}

test("one owner, a private directory and a private socket", async () => {
  const { runtime, hub } = await setup()
  expect(statSync(runtime).mode & 0o777).toBe(0o700)
  expect(statSync(socketPath(runtime)).mode & 0o777).toBe(0o600)
  let built = false
  const second = listen(runtime, () => {
    built = true
    return hub
  }, VERSION)
  expect(second).rejects.toBeInstanceOf(AlreadyRunning)
  await second.catch(() => {})
  expect(built).toBe(false)
})

test("a stale socket file is replaced once the lock is free", async () => {
  const { runtime, hub, server } = await setup()
  await server.close()
  writeFileSync(socketPath(runtime), "stale")
  const again = await listen(runtime, () => hub, VERSION)
  cleanup.push(() => again.close())
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION })
  expect((await client.waitFor(1))[0]?.["type"]).toBe("snapshot")
})

test("a version mismatch is refused without stopping the coordinator", async () => {
  const { runtime } = await setup()
  const old = connect(runtime)
  old.send({ type: "hello", version: "0.9.0" })
  await old.closed
  expect(old.lines).toEqual([{ type: "version_mismatch", coordinator: VERSION, client: "0.9.0" }])
  const current = connect(runtime)
  current.send({ type: "hello", version: VERSION })
  expect((await current.waitFor(1))[0]?.["type"]).toBe("snapshot")
})

test("a request's events arrive after the snapshot and before its response", async () => {
  const { runtime } = await setup()
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION })
  await client.waitFor(1)
  client.send({ type: "request", id: 7, command: { method: "send", session: id, text: "hi" } })
  const lines = await client.waitFor(5)
  const types = lines.map((l) => l["type"])
  expect(types[0]).toBe("snapshot")
  expect(types.at(-1)).toBe("response")
  expect(types.slice(1, -1).every((t) => t === "event")).toBe(true)
  expect(lines.at(-1)).toEqual({ type: "response", id: 7, result: { accepted: "coordinator" } })
  const seqs = lines.slice(1, -1).map((l) => l["seq"])
  expect(seqs).toEqual(seqs.map((_, i) => Number(lines[0]?.["seq"]) + i + 1))
})

test("bad messages are answered with an error and the connection stays", async () => {
  const { runtime } = await setup()
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION })
  await client.waitFor(1)
  client.socket.write("not json\n")
  client.send({ type: "request", id: 1, command: { method: "send", session: "missing", text: "x" } })
  const lines = await client.waitFor(3)
  expect(lines.slice(1)).toEqual([
    { type: "error", message: "bad message" },
    { type: "response", id: 1, error: "no such session missing" },
  ])
})

test("a client that stops reading is dropped instead of buffered", async () => {
  const { runtime, hub, updates } = await setup()
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION })
  await client.waitFor(1)
  hub.command({ method: "send", session: id, text: "go" })
  client.socket.pause()
  const text = "x".repeat(100 * 1024)
  const count = Math.ceil((OUTBOX_LIMIT * 2) / text.length)
  Array.from({ length: count }, (_, n) => updates[0]?.({ type: "event", event: { kind: "text", block: `b${n}`, text } }))
  client.socket.resume()
  await client.closed
  expect(client.lines.some((l) => l["type"] === "dropped")).toBe(false)
  expect(client.lines.length).toBeLessThan(count)
})

test("a requests-only client gets ready and no events", async () => {
  const { runtime } = await setup()
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION, subscribe: false })
  await client.waitFor(1)
  client.send({ type: "request", id: 1, command: { method: "send", session: id, text: "hi" } })
  const lines = await client.waitFor(2)
  await Bun.sleep(100)
  expect(lines.map((l) => l["type"])).toEqual(["ready", "response"])
})

test("a pending wait does not hold up other requests on the connection", async () => {
  const { runtime, updates } = await setup()
  const client = connect(runtime)
  client.send({ type: "hello", version: VERSION, subscribe: false })
  await client.waitFor(1)
  const tool = (rid: number, name: string, input: object) => client.send({ type: "request", id: rid, command: { method: "tool", master: id, name, input } })
  tool(1, "spawn_subagent", { name: "w", task: "go" })
  await client.waitFor(2)
  tool(2, "wait_for_subagents", {})
  tool(3, "list_subagents", {})
  await client.waitFor(3)
  expect(client.lines.at(-1)?.["id"]).toBe(3)
  updates.at(-1)?.({ type: "event", event: { kind: "turn-end", isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text: "done" } })
  const lines = await client.waitFor(4)
  expect(lines.at(-1)?.["id"]).toBe(2)
  expect((lines.at(-1)?.["result"] as { timedOut: boolean }).timedOut).toBe(false)
})
