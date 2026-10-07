// Claude provider against a fake SDK query.

import type { CanUseTool, Options, PermissionResult, PermissionUpdate, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { expect, test } from "bun:test"
import { type QueryFn, startClaude } from "../src/coordinator/claude.ts"
import type { ProviderUpdate } from "../src/coordinator/provider.ts"
import { asNativeId, type SessionState } from "../src/shared/coordinator.ts"
import { asFilePath, asRequestId } from "../src/shared/ids.ts"
import { sample } from "./fixtures/store.ts"

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// Fake query: records its options and streams pushed messages until ended
const fakeQuery = () => {
  const queue: Array<object> = []
  let wake = () => {}
  let ended = false
  let options: Options | null = null
  let prompt: AsyncIterable<SDKUserMessage> | null = null
  async function* messages(): AsyncGenerator<object> {
    while (!ended || queue.length > 0) {
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  }
  const end = () => {
    ended = true
    wake()
  }
  const run: QueryFn = (params) => {
    options = params.options
    prompt = params.prompt
    return Object.assign(messages(), { interrupt: async () => undefined, close: end })
  }
  const push = (m: object) => {
    queue.push(m)
    wake()
  }
  return { run, push, end, options: () => options, prompt: () => prompt }
}

const start = (state: SessionState) => {
  const fake = fakeQuery()
  const updates: Array<ProviderUpdate> = []
  const session = { ...sample("s", "claude", state), nativeId: asNativeId("native") }
  const handle = startClaude(session, asFilePath("/bin/claude"), (u) => updates.push(u), fake.run)
  return { fake, updates, handle }
}

const init = (sessionId: string) => ({ type: "system", subtype: "init", session_id: sessionId, model: "m", cwd: "/tmp", tools: [] })

const rule: PermissionUpdate = { type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" }

// Asks the provider for permission as the SDK would
const ask = (canUseTool: CanUseTool | undefined, extra: { suggestions?: Array<PermissionUpdate>; suppressAlwaysAllowRule?: boolean; signal?: AbortSignal } = {}) =>
  canUseTool?.("Bash", { command: "ls" }, { signal: extra.signal ?? new AbortController().signal, toolUseID: "tool-1", requestId: "req-1", ...extra })

test("a new session passes the saved id, and ready with it confirms creation", async () => {
  const { fake, updates } = start("creating")
  expect(fake.options()?.sessionId).toBe("native")
  expect(fake.options()?.resume).toBeUndefined()
  fake.push(init("native"))
  await settle()
  expect(updates.map((u) => u.type)).toEqual(["event", "created"])
})

test("a different reported id is an error, not a confirmation", async () => {
  const { fake, updates } = start("creating")
  fake.push(init("other"))
  await settle()
  expect(updates.map((u) => u.type)).toEqual(["event", "error"])
})

test("an existing session resumes its saved id", () => {
  const { fake } = start("interrupted")
  expect(fake.options()?.resume).toBe("native")
  expect(fake.options()?.sessionId).toBeUndefined()
})

test("only an offered choice answers, the first valid answer wins, and always carries the suggestions", async () => {
  const { fake, updates, handle } = start("idle")
  const result = ask(fake.options()?.canUseTool, { suggestions: [rule] })
  const approval = updates.find((u) => u.type === "approval")
  expect(approval?.type === "approval" ? approval.choices : null).toEqual(["allow", "always", "deny"])
  const request = asRequestId("req-1")
  expect(handle.answer(request, { choice: "maybe" })).toBe(false)
  expect(handle.answer(request, { choice: "always", updatedInput: { command: "pwd" } })).toBe(true)
  expect(handle.answer(request, { choice: "deny" })).toBe(false)
  expect(await result).toEqual({ behavior: "allow", updatedInput: { command: "pwd" }, updatedPermissions: [rule] } satisfies PermissionResult)
})

test("always is not offered when the SDK suppresses it", () => {
  const { fake, updates, handle } = start("idle")
  void ask(fake.options()?.canUseTool, { suggestions: [rule], suppressAlwaysAllowRule: true })
  const approval = updates.find((u) => u.type === "approval")
  expect(approval?.type === "approval" ? approval.choices : null).toEqual(["allow", "deny"])
  expect(handle.answer(asRequestId("req-1"), { choice: "always" })).toBe(false)
})

test("an aborted request is withdrawn and can no longer be answered", async () => {
  const { fake, updates, handle } = start("idle")
  const abort = new AbortController()
  const result = ask(fake.options()?.canUseTool, { signal: abort.signal })
  abort.abort()
  expect(await result).toEqual({ behavior: "deny", message: "cancelled" })
  expect(updates.at(-1)).toEqual({ type: "approval-gone", request: asRequestId("req-1") })
  expect(handle.answer(asRequestId("req-1"), { choice: "allow" })).toBe(false)
})

test("input reaches the SDK prompt, and the end of the stream reports exit", async () => {
  const { fake, updates, handle } = start("idle")
  handle.input("hello")
  const first = await fake.prompt()?.[Symbol.asyncIterator]().next()
  expect(first?.value?.message).toEqual({ role: "user", content: "hello" })
  fake.end()
  await settle()
  expect(updates.at(-1)).toEqual({ type: "exited" })
})
