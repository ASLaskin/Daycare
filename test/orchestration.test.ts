// Orchestration tools through the hub, with fake providers.

import { afterEach, expect, test } from "bun:test"
import { record } from "../src/coordinator/history.ts"
import { type Launch, makeHub } from "../src/coordinator/hub.ts"
import { type ProviderUpdate, Refused } from "../src/coordinator/provider.ts"
import { createSession } from "../src/coordinator/store.ts"
import { asNativeId } from "../src/shared/coordinator.ts"
import { asRequestId, asSessionId, type SessionId } from "../src/shared/ids.ts"
import { type Json, obj, str } from "../src/shared/json.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const master = asSessionId("m")
const dbs: Array<ReturnType<typeof tempDb>> = []
afterEach(() => dbs.splice(0).forEach((db) => db.remove()))

type Accept = "resolve" | "hang" | "refuse" | "fail"

const setup = (accept: Accept = "resolve") => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("m", "claude", "idle"), nativeId: asNativeId("n"), model: "opus" })
  const updates = new Map<SessionId, (u: ProviderUpdate) => void>()
  const launch: Launch = (session, update) => {
    updates.set(session.id, update)
    return {
      input: () => {
        switch (accept) {
          case "resolve":
            return Promise.resolve()
          case "hang":
            return new Promise<void>(() => {})
          case "refuse":
            return Promise.reject(new Refused("claude has stopped"))
          case "fail":
            return Promise.reject(new Error("codex exited"))
        }
      },
      interrupt: () => {},
      answer: () => true,
      close: async () => {},
    }
  }
  const hub = makeHub(conn, launch, 50)
  const tool = async (name: string, input: Json, from: SessionId = master, signal = new AbortController().signal) => {
    const r = await hub.tool(from, name, input, signal)
    if ("error" in r) {
      throw new Error(r.error)
    }
    return obj(r.result) ?? {}
  }
  return { conn, hub, tool, updates }
}

const turnEnd = (text: string): ProviderUpdate => ({
  type: "event",
  event: { kind: "turn-end", isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text },
})

test("a spawned worker is a visible session under its master, found by name", async () => {
  const { hub, tool } = setup()
  const spawned = await tool("spawn_subagent", { name: "Researcher", task: "look", provider: "codex" })
  expect([spawned["provider"], spawned["delivered"]]).toEqual(["codex", "provider"])
  const worker = hub.subscribe(() => true).sessions.find((s) => s.id === str(spawned["id"]))
  expect([worker?.role, worker?.parentId, worker?.provider, worker?.model]).toEqual(["worker", master, "codex", null])
  const read = await tool("read_subagent", { worker: "researcher" })
  expect(read["finalMessage"]).toBe("(no reply yet)")
  await expect(tool("read_subagent", { worker: "nobody" })).rejects.toThrow('no worker "nobody"; known workers: Researcher')
  await expect(tool("list_subagents", {}, asSessionId(str(spawned["id"]) ?? ""))).rejects.toThrow("only a master session can orchestrate workers")
})

test("a same-provider worker inherits the master's model", async () => {
  const { hub, tool } = setup()
  const spawned = await tool("spawn_subagent", { name: "a", task: "go" })
  expect(hub.subscribe(() => true).sessions.find((s) => s.id === str(spawned["id"]))?.model).toBe("opus")
})

test("delivery is uncertain without confirmation, an error when refused, uncertain on an ambiguous failure", async () => {
  expect((await setup("hang").tool("spawn_subagent", { name: "a", task: "go" }))["delivered"]).toBe("uncertain")
  await expect(setup("refuse").tool("spawn_subagent", { name: "a", task: "go" })).rejects.toThrow("a did not receive the message: claude has stopped")
  expect((await setup("fail").tool("spawn_subagent", { name: "a", task: "go" }))["delivered"]).toBe("uncertain")
})

test("read reports the latest reply and whether history was truncated", async () => {
  const { conn, tool, updates } = setup()
  const id = asSessionId(str((await tool("spawn_subagent", { name: "a", task: "go" }))["id"]) ?? "")
  updates.get(id)?.({ type: "event", event: { kind: "text", block: "b", text: "result" } })
  conn.run(`UPDATE sessions SET history_evicted = 1 WHERE id = '${id}'`)
  const read = await tool("read_subagent", { worker: "a" })
  expect([read["finalMessage"], read["historyTruncated"]]).toEqual(["result", true])
})

test("wait answers once every worker settles, with each first line", async () => {
  const { tool, updates } = setup()
  const a = asSessionId(str((await tool("spawn_subagent", { name: "a", task: "go" }))["id"]) ?? "")
  const b = asSessionId(str((await tool("spawn_subagent", { name: "b", task: "go" }))["id"]) ?? "")
  let answered: Json | null = null
  void tool("wait_for_subagents", {}).then((r) => {
    answered = r
  })
  updates.get(a)?.(turnEnd("done a\nmore"))
  await Bun.sleep(10)
  expect(answered).toBeNull()
  updates.get(b)?.({ type: "approval", request: asRequestId("r"), choices: ["allow"], event: { kind: "rate-limit", percent: 1 } })
  await Bun.sleep(10)
  const result = obj(answered)
  expect(result?.["timedOut"]).toBe(false)
  expect((result?.["workers"] as ReadonlyArray<Record<string, Json>>).map((w) => [w["name"], w["needsUser"], w["summary"]])).toEqual([
    ["a", false, "done a"],
    ["b", true, "(no reply yet)"],
  ])
})

test("wait times out, and an abandoned wait never answers", async () => {
  const { tool } = setup()
  await tool("spawn_subagent", { name: "a", task: "go" })
  expect((await tool("wait_for_subagents", { timeout_seconds: 0 }))["timedOut"]).toBe(true)
  const abort = new AbortController()
  let answered = false
  void tool("wait_for_subagents", { timeout_seconds: 0.05 }, master, abort.signal).then(() => {
    answered = true
  })
  abort.abort()
  await Bun.sleep(100)
  expect(answered).toBe(false)
})

test("bad arguments and unknown tools are errors", async () => {
  const { tool } = setup()
  await expect(tool("spawn_subagent", { name: "a" })).rejects.toThrow("bad arguments for spawn_subagent")
  await expect(tool("do_magic", {})).rejects.toThrow("unknown tool do_magic")
})

test("history recorded for a worker counts toward its last reply", async () => {
  const { conn, tool } = setup()
  const id = asSessionId(str((await tool("spawn_subagent", { name: "a", task: "go" }))["id"]) ?? "")
  record(conn, id, 1, { kind: "text", block: "x", text: "from history" })
  expect((await tool("read_subagent", { worker: "a" }))["finalMessage"]).toBe("from history")
})
