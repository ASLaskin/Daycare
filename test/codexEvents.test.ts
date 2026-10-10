// Codex notifications mapped to Daycare chat events.

import { expect, test } from "bun:test"
import { Result } from "effect"
import { codexEvents } from "../src/coordinator/codexEvents.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import type { Json } from "../src/shared/json.ts"

const ok = (method: string, params: Json): ReadonlyArray<ChatEvent> => {
  const r = codexEvents(method, params)
  if (Result.isFailure(r)) {
    throw new Error(r.failure)
  }
  return r.success
}

const failed = (method: string, params: Json) => Result.isFailure(codexEvents(method, params))

const command = { type: "commandExecution", id: "c", command: "ls", cwd: "/", commandActions: [], status: "completed", aggregatedOutput: "a", exitCode: 2 }

test("messages stream as deltas and complete under the same block", () => {
  expect(ok("item/agentMessage/delta", { itemId: "m", delta: "hi", threadId: "t", turnId: "u" })).toEqual([{ kind: "text-delta", block: "m", text: "hi" }])
  expect(ok("item/completed", { item: { type: "agentMessage", id: "m", text: "hi", extra: 1 } })).toEqual([{ kind: "text", block: "m", text: "hi" }])
})

test("commands become Bash tool events; a non-zero exit is an error", () => {
  const [start] = ok("item/started", { item: command })
  expect(start?.kind === "tool-start" ? [start.name, start.title] : null).toEqual(["Bash", "ls"])
  const [end] = ok("item/completed", { item: command })
  expect(end?.kind === "tool-end" ? [end.isError, end.content] : null).toEqual([true, "a"])
  const [clean] = ok("item/completed", { item: { ...command, exitCode: 0, aggregatedOutput: null } })
  expect(clean?.kind === "tool-end" ? [clean.isError, clean.content] : null).toEqual([false, ""])
})

test("MCP calls carry their server and tool, and an error marks failure", () => {
  const call = { type: "mcpToolCall", id: "x", server: "daycare", tool: "list", arguments: { a: 1 }, status: "failed", error: { message: "no" } }
  const [start] = ok("item/started", { item: call })
  expect(start?.kind === "tool-start" ? start.name : null).toBe("mcp__daycare__list")
  const [end] = ok("item/completed", { item: call })
  expect(end?.kind === "tool-end" ? [end.isError, end.content] : null).toEqual([true, '{"message":"no"}'])
})

test("turns map to state and turn-end, with failures carrying their message", () => {
  expect(ok("turn/started", { threadId: "t", turn: { id: "u", items: [], status: "inProgress" } })).toEqual([{ kind: "state", state: "running" }])
  const [end, idle] = ok("turn/completed", { threadId: "t", turn: { id: "u", items: [], status: "failed", error: { message: "boom" }, durationMs: 5 } })
  expect(end?.kind === "turn-end" ? [end.isError, end.text, end.durationMs] : null).toEqual([true, "boom", 5])
  expect(idle).toEqual({ kind: "state", state: "idle" })
})

test("unknown notifications and item types are ignored", () => {
  expect(ok("thread/tokenUsage/updated", { anything: true })).toEqual([])
  expect(ok("item/completed", { item: { type: "imageView", id: "i" } })).toEqual([])
})

test("malformed required data is an error, not a plausible event", () => {
  expect(failed("item/completed", { item: { type: "agentMessage", id: "m" } })).toBe(true)
  expect(failed("item/agentMessage/delta", { itemId: "m" })).toBe(true)
  expect(failed("turn/completed", { turn: {} })).toBe(true)
  expect(failed("item/started", { item: { type: "commandExecution", id: "c" } })).toBe(true)
})
