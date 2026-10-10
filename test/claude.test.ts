// Claude provider against a fake SDK query.

import type { CanUseTool, Options, PermissionResult, PermissionUpdate, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { expect, test } from "bun:test"
import { type QueryFn, startClaude } from "../src/coordinator/claude.ts"
import { type ProviderUpdate, Refused } from "../src/coordinator/provider.ts"
import { asNativeId, type SessionState } from "../src/shared/coordinator.ts"
import { asDirPath, asFilePath, asRequestId } from "../src/shared/ids.ts"
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

test("an aborted request is withdrawn and can no longer be answered", async () => {
  const { fake, updates, handle } = start("idle")
  const abort = new AbortController()
  const result = ask(fake.options()?.canUseTool, { signal: abort.signal })
  abort.abort()
  expect(await result).toEqual({ behavior: "deny", message: "cancelled" })
  expect(updates.at(-1)).toEqual({ type: "approval-gone", request: asRequestId("req-1") })
  expect(handle.answer(asRequestId("req-1"), { choice: "allow" })).toBe(false)
})

test("input is confirmed only by claude's reply stamped with its uuid", async () => {
  const { fake, updates, handle } = start("idle")
  let confirmed = false
  void handle.input("hello").then(() => {
    confirmed = true
  })
  const prompt = fake.prompt()?.[Symbol.asyncIterator]()
  const first = await prompt?.next()
  await settle()
  expect(first?.value?.message).toEqual({ role: "user", content: "hello" })
  expect(confirmed).toBe(false)
  fake.push({ type: "stream_event", user_message_uuid: first?.value?.uuid, event: { type: "message_start", message: { id: "m" } } })
  await settle()
  expect(confirmed).toBe(true)

  const second = handle.input("unanswered").then(
    () => "confirmed",
    (e: Error) => (e instanceof Refused ? "refused" : "uncertain"),
  )
  await prompt?.next()
  fake.end()
  expect(await second).toBe("uncertain")
  await settle()
  expect(updates.at(-1)).toEqual({ type: "exited" })
})

test("inputs never taken are refused when the session closes or the stream ends", async () => {
  const closing = start("idle")
  const pendingClose = closing.handle.input("never taken")
  await closing.handle.close()
  expect(pendingClose).rejects.toThrow("the session was closed before claude took the input")
  expect(closing.handle.input("after")).rejects.toThrow("claude has stopped")

  const ending = start("idle")
  const pendingEnd = ending.handle.input("never taken")
  ending.fake.end()
  expect(pendingEnd).rejects.toThrow("claude exited before taking the input")
  await settle()
  expect(ending.updates.at(-1)).toEqual({ type: "exited" })
})

// Text appended to the preset system prompt
const appended = (o: Options | null) => {
  const p = o?.systemPrompt
  return typeof p === "object" && !Array.isArray(p) && p.type === "preset" ? (p.append ?? "") : ""
}

test("masters get the Daycare bridge and prompt; every role loses Claude's own subagents", () => {
  const master = start("idle")
  const opts = master.fake.options()
  const daycare = opts?.mcpServers?.["daycare"]
  expect(daycare && "command" in daycare ? [daycare.command, daycare.args, daycare.alwaysLoad, daycare.timeout] : null).toEqual([
    process.execPath,
    [expect.stringMatching(/src\/coordinator\/mcp\.ts$/), "s"],
    true,
    1_800_000,
  ])
  expect(opts?.allowedTools).toEqual(["spawn_subagent", "list_subagents", "wait_for_subagents", "read_subagent", "send_to_subagent"].map((n) => `mcp__daycare__${n}`))
  expect(opts?.disallowedTools).toEqual(["Task", "Agent"])
  expect(appended(opts)).toStartWith("You are a master session")

  const worker = fakeQuery()
  startClaude({ ...sample("w", "claude", "idle"), role: "worker", nativeId: asNativeId("nw") }, asFilePath("/bin/claude"), () => {}, worker.run)
  const wopts = worker.options()
  expect(wopts?.mcpServers).toBeUndefined()
  expect(wopts?.disallowedTools).toEqual(["Task", "Agent"])
  expect(appended(wopts)).toStartWith("You are a worker session")
})

test("claude runs on its account's config dir, or ~/.claude for Default", () => {
  const added = fakeQuery()
  startClaude({ ...sample("a", "claude", "idle"), nativeId: asNativeId("na"), configDir: asDirPath("/accounts/work") }, asFilePath("/bin/claude"), () => {}, added.run)
  expect(added.options()?.env?.["CLAUDE_CONFIG_DIR"]).toBe("/accounts/work")
  const inherited = process.env["CLAUDE_CONFIG_DIR"]
  process.env["CLAUDE_CONFIG_DIR"] = "/inherited"
  try {
    const fallback = fakeQuery()
    startClaude({ ...sample("d", "claude", "idle"), nativeId: asNativeId("nd") }, asFilePath("/bin/claude"), () => {}, fallback.run)
    expect(fallback.options()?.env).not.toHaveProperty("CLAUDE_CONFIG_DIR")
  } finally {
    if (inherited === undefined) {
      delete process.env["CLAUDE_CONFIG_DIR"]
    } else {
      process.env["CLAUDE_CONFIG_DIR"] = inherited
    }
  }
})
