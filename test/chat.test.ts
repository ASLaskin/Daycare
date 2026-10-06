// Chat service against a fake claude; cases run in order.

import { afterAll, describe, expect, test } from "bun:test"
import { Deferred, Effect, ManagedRuntime, Stream } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Chat } from "../src/main/chat/Chat.ts"
import { historyFromTranscript } from "../src/main/chat/transcript.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import { asDirPath, asFilePath, asRequestId, asSessionId, type FilePath } from "../src/shared/ids.ts"
import { at, type Json, parseJson, str, strings } from "../src/shared/json.ts"

const FAKE = path.join(import.meta.dir, "fixtures", "fake-claude.js")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-test-"))
const J = (o: Json) => JSON.stringify(o) + "\n"

// Events per chat id from one subscription
const events = new Map<string, Array<ChatEvent>>()

const makeRuntime = (claudePath: string) => {
  return ManagedRuntime.make(Chat.layer(asFilePath(claudePath)))
}
let runtime = makeRuntime(FAKE)
const run = <A>(f: (chat: Chat["Service"]) => Effect.Effect<A>) =>
  runtime.runSync(Chat.use(f))

const listen = (rt: ReturnType<typeof makeRuntime>) =>
  rt.runPromise(
    Effect.gen(function* () {
      const chat = yield* Chat
      const subscribed = yield* Deferred.make<void>()
      yield* Effect.forkDetach(
        Effect.scoped(
          Effect.gen(function* () {
            const stream = yield* chat.subscribe
            yield* Deferred.succeed(subscribed, undefined)
            yield* Stream.runForEach(stream, ({ id, event }) =>
              Effect.sync(() => {
                const list = events.get(id) ?? []
                list.push(event)
                events.set(id, list)
              }),
            )
          }),
        ),
      )
      yield* Deferred.await(subscribed)
    }),
  )

let n = 0
const launch = (scenario: ReadonlyArray<Json>, extra: Array<string> = [], transcriptPath: FilePath | null = null) => {
  const id = asSessionId(`t${++n}`)
  const files = {
    scenario: path.join(dir, `${id}.json`),
    log: path.join(dir, `${id}.log`),
    argv: path.join(dir, `${id}.argv`),
    env: path.join(dir, `${id}.env`),
  }
  fs.writeFileSync(files.scenario, JSON.stringify(scenario))
  fs.writeFileSync(files.log, "")
  events.set(id, [])
  // Environment without CLAUDE_CODE_ variables
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE_CODE_")))
  run((chat) =>
    chat.start({
      id,
      cwd: asDirPath(dir),
      args: extra,
      transcriptPath,
      env: { ...base, SCENARIO: files.scenario, LOG: files.log, ARGV: files.argv, ENVF: files.env },
    }),
  )
  return {
    id,
    files,
    ev: () => events.get(id) ?? [],
    stdin: (): Array<Json> =>
      fs
        .readFileSync(files.log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => parseJson(l)),
  }
}

const until = async (pred: () => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (pred()) {
      return true
    }
    await Bun.sleep(10)
  }
  return false
}

const kinds = <K extends ChatEvent["kind"]>(ev: ReadonlyArray<ChatEvent>, k: K) =>
  ev.filter((e): e is Extract<ChatEvent, { kind: K }> => e.kind === k)

// Item at an index, failing the test when missing
const item = <T>(xs: ReadonlyArray<T>, i = 0): T => {
  const x = xs[i]
  if (x === undefined) {
    throw new Error(`No item at ${i}`)
  }
  return x
}

// Subscribe before the first child starts
await listen(runtime)

afterAll(async () => {
  await runtime.dispose()
  fs.rmSync(dir, { recursive: true, force: true })
})

const delta = (t: string, index = 1) => J({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } }, parent_tool_use_id: null, uuid: 'u', session_id: 'S1' });
const deltaLine = delta('Hel');
const cut = Math.floor(deltaLine.length / 2);
const usage = { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 40 };
// Turn usage summed, with the last call in iterations
const summed = { input_tokens: 34, cache_creation_input_tokens: 9164, cache_read_input_tokens: 37296, output_tokens: 663, iterations: [{ input_tokens: 8, cache_creation_input_tokens: 136, cache_read_input_tokens: 22478, output_tokens: 81, type: 'message' }] };
const result = (cost: number, u: Json = usage) => J({ type: 'result', subtype: 'success', is_error: false, result: 'Hello', stop_reason: 'end_turn', total_cost_usd: cost, usage: u, modelUsage: { 'claude-sonnet-4-5': { contextWindow: 200000 } }, num_turns: 1, duration_ms: 1234, session_id: 'S1' });

const scenarioA = [
  { stderr: 'error: boom\nsecond line\n' },
  { write: J({ type: 'system', subtype: 'init', session_id: 'S1', cwd: '/work', tools: ['Bash', 'Read'], model: 'claude-sonnet-4-5', permissionMode: 'default', slash_commands: ['compact'], capabilities: [] }) },
  { write: J({ type: 'system', subtype: 'session_state_changed', state: 'running' }) },
  { write: J({ type: 'system', subtype: 'status', status: 'requesting' }) },
  { write: J({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } } }) },
  { write: J({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 384, estimated_tokens_delta: 134 }) },
  { write: J({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } }) },
  { write: J({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } } }) },
  { write: J({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } }) },
  { write: deltaLine.slice(0, cut) },
  { delay: 30 },
  { write: deltaLine.slice(cut) + delta('lo') },
  { write: J({ type: 'assistant', message: { id: 'msg_1', content: [{ type: 'thinking', thinking: 'hmm' }] }, parent_tool_use_id: null }) },
  { write: J({ type: 'assistant', message: { id: 'msg_1', content: [{ type: 'text', text: 'Hello' }] }, parent_tool_use_id: null }) },
  { write: '{not json at all\n' + J({ type: 'mystery', x: 1 }) + J({ type: 'system', subtype: 'brand_new' }) + '\n' },
  { write: J({ type: 'assistant', message: { id: 'msg_2', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }, { type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/a/b.txt' } }] }, parent_tool_use_id: null }) },
  { write: J({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a.txt', is_error: false }] }, tool_use_result: { stdout: 'a.txt', stderr: '' } }) },
  { write: J({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'nope' }], is_error: true }] } }) },
  { write: J({ type: 'control_request', request_id: 'req_1', request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Run command', input: { command: 'rm x' }, description: 'Remove x', tool_use_id: 'toolu_3', permission_suggestions: [{ type: 'addRules' }] } }) },
  { write: J({ type: 'control_request', request_id: 'req_2', request: { subtype: 'can_use_tool', tool_name: 'Read', input: { file_path: '/a/c.txt' }, tool_use_id: 'toolu_5' } }) },
  { write: J({ type: 'control_cancel_request', request_id: 'req_2' }) },
  { waitStdin: 3 },
  { write: J({ type: 'system', subtype: 'task_started', task_id: 'tk1', tool_use_id: 'toolu_4', description: 'Explore repo', subagent_type: 'Explore', is_backgrounded: false, spawn_depth: 1, task_type: 'local_agent', prompt: 'p' }) },
  { write: J({ type: 'system', subtype: 'task_progress', task_id: 'tk1', usage: { total_tokens: 500, tool_uses: 2, duration_ms: 900 }, last_tool_name: 'Read' }) },
  { write: J({ type: 'system', subtype: 'task_updated', task_id: 'tk1', patch: { status: 'completed' } }) },
  { write: J({ type: 'system', subtype: 'task_notification', task_id: 'tk1', status: 'completed', summary: 'Found it', usage: { total_tokens: 800 }, output_file: '/tmp/o' }) },
  { write: J({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.42 } } } }) },
  { write: result(0.0123, summed) + result(0.0456) },
  { write: J({ type: 'system', subtype: 'session_state_changed', state: 'idle' }) },
  { delay: 50 },
  { exit: 3 },
]

describe("one long scenario", () => {
  const a = launch(scenarioA, ["--model", "sonnet"])

  test("init yields ready with session id, model, cwd, tools", async () => {
    expect(await until(() => kinds(a.ev(), "ready").length === 1)).toBe(true)
    const ready = item(kinds(a.ev(), "ready"))
    expect([ready.claudeSessionId, ready.model, ready.cwd, ready.tools.length, ready.slashCommands[0]]).toEqual([
      "S1",
      "claude-sonnet-4-5",
      "/work",
      2,
      "compact",
    ])
  })

  test("the child is told to emit session state events", async () => {
    expect(await until(() => fs.existsSync(a.files.env))).toBe(true)
    expect(at(parseJson(fs.readFileSync(a.files.env, "utf8")) ?? undefined, "CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS")).toBe("1")
  })

  test("argv carries base flags and extra args", () => {
    const argv = strings(parseJson(fs.readFileSync(a.files.argv, "utf8")) ?? undefined)
    expect(argv).toEqual(expect.arrayContaining(["-p", "--verbose", "--include-partial-messages"]))
    expect(argv.join(" ")).toContain("--permission-prompt-tool stdio")
    expect(argv.join(" ")).toContain("--input-format stream-json")
    expect(argv.slice(-2)).toEqual(["--model", "sonnet"])
  })

  test("deltas split mid-line arrive in order and are replaced by the final text", async () => {
    await until(() => kinds(a.ev(), "text").length === 1)
    const deltas = kinds(a.ev(), "text-delta")
    const text = item(kinds(a.ev(), "text"))
    expect(deltas.map((d) => d.text)).toEqual(["Hel", "lo"])
    expect(text.text).toBe("Hello")
    expect(deltas.every((d) => d.block === text.block)).toBe(true)
  })

  test("thinking comes from the assistant line with the estimated token count", () => {
    const thinking = item(kinds(a.ev(), "thinking"))
    expect(thinking.text).toBe("hmm")
    expect(thinking.tokens).toBe(384)
    expect(thinking.block).not.toBe(item(kinds(a.ev(), "text")).block)
  })

  test("a malformed line and unknown types do not stop later events", async () => {
    await until(() => kinds(a.ev(), "permission").length === 2)
    expect(kinds(a.ev(), "tool-start").length).toBe(2)
  })

  test("tool_use and tool_result pair up", () => {
    const starts = kinds(a.ev(), "tool-start")
    const s1 = item(starts, 0)
    expect([s1.toolUseId, s1.name, at(s1.input, "command"), s1.title, s1.parentToolUseId]).toEqual(["toolu_1", "Bash", "ls", "Bash: ls", null])
    expect(item(starts, 1).title).toBe("Read: b.txt")
    const ends = kinds(a.ev(), "tool-end")
    const e1 = item(ends, 0)
    const e2 = item(ends, 1)
    expect([e1.toolUseId, e1.isError, at(e1.structured ?? undefined, "stdout")]).toEqual(["toolu_1", false, "a.txt"])
    expect([e2.toolUseId, e2.isError, e2.content]).toEqual(["toolu_2", true, "nope"])
    expect(item(kinds(a.ev(), "state")).state).toBe("running")
  })

  test("permissions: prompt, answer once, interrupt", async () => {
    const perm = item(kinds(a.ev(), "permission"))
    expect([perm.requestId, perm.toolUseId, perm.name, perm.title, perm.description, perm.suggestions.length]).toEqual([
      "req_1",
      "toolu_3",
      "Bash",
      "Run command",
      "Remove x",
      1,
    ])
    expect(run((chat) => chat.respond(a.id, asRequestId("does-not-exist"), { allow: true }))).toBe(false)
    run((chat) => chat.respond(a.id, asRequestId("req_1"), { allow: true }))
    // Second answer to the same request is ignored
    run((chat) => chat.respond(a.id, asRequestId("req_1"), { allow: false }))
    run((chat) => chat.interrupt(a.id))
    await until(() => a.stdin().length >= 2)
    const lines = a.stdin()
    expect(lines[0]).toEqual({
      type: "control_response",
      response: { subtype: "success", request_id: "req_1", response: { behavior: "allow", updatedInput: { command: "rm x" } } },
    })
    const resolved = kinds(a.ev(), "permission-resolved").filter((e) => e.requestId === "req_1")
    expect(resolved).toEqual([{ kind: "permission-resolved", requestId: asRequestId("req_1"), allowed: true }])
    const interrupt = item(lines, 1)
    expect(at(interrupt, "type")).toBe("control_request")
    expect(str(at(interrupt, "request_id"))?.length).toBeGreaterThan(0)
    expect(at(interrupt, "request")).toEqual({ subtype: "interrupt" })
    expect(lines.length).toBe(2)
    // Third stdin line releases the scenario
    run((chat) => chat.send(a.id, "go on"))
  })

  test("turn-end: context from the last iteration, cumulative cost", async () => {
    await until(() => kinds(a.ev(), "turn-end").length === 2)
    const ends = kinds(a.ev(), "turn-end")
    const t1 = item(ends, 0)
    const t2 = item(ends, 1)
    expect(t1.contextTokens).toBe(22703)
    expect(t2.contextTokens).toBe(3250)
    expect([t1.text, t1.stopReason, t1.numTurns, t1.durationMs, t1.isError]).toEqual(["Hello", "end_turn", 1, 1234, false])
    expect([t1.costUsd, t2.costUsd]).toEqual([0.0123, 0.0456])
    const info = run((chat) => chat.info(a.id))!
    expect([info.costUsd, info.contextTokens]).toEqual([0.0456, 3250])
  })

  test("task lifecycle, rate limit percent, cancelled permission, idle", () => {
    const tasks = kinds(a.ev(), "task")
    expect(tasks.map((t) => t.status)).toEqual(["running", "running", "completed", "completed"])
    const progress = item(tasks, 1)
    const done = item(tasks, 3)
    expect([progress.lastTool, at(progress.usage ?? undefined, "tool_uses")]).toEqual(["Read", 2])
    expect([done.summary, done.description, done.subagentType]).toEqual(["Found it", "Explore repo", "Explore"])
    expect(item(kinds(a.ev(), "rate-limit")).percent).toBe(42)
    const cancelled = kinds(a.ev(), "permission-resolved").find((e) => e.requestId === "req_2")
    expect(cancelled).toMatchObject({ allowed: false, reason: "cancelled" })
    expect(kinds(a.ev(), "state").map((s) => s.state)).toEqual(["running", "idle"])
  })

  test("exit carries the code and stderr tail; history keeps finals but not deltas", async () => {
    expect(await until(() => kinds(a.ev(), "exit").length === 1)).toBe(true)
    const exit = item(kinds(a.ev(), "exit"))
    expect(exit.code).toBe(3)
    expect(exit.stderrTail).toContain("boom")
    expect(exit.stderrTail).toContain("second line")
    const history = run((chat) => chat.history(a.id))
    expect(history.length).toBeGreaterThan(0)
    expect(history.some((e) => e.kind === "text-delta")).toBe(false)
    expect(history.some((e) => e.kind === "user" && e.text === "go on")).toBe(true)
    expect(run((chat) => chat.info(a.id))!.state).toBe("exited")
    run((chat) => chat.send(a.id, "ignored"))
  })
})

test("turns sent before the child spawns are flushed in order, surviving backpressure", async () => {
  const m = launch([{ pauseStdin: 300 }, { waitStdin: 52 }, { exit: 0 }])
  run((chat) => chat.send(m.id, "first"))
  run((chat) => chat.send(m.id, "second"))
  const big = "y".repeat(100 * 1024)
  Array.from({ length: 50 }, (_, i) => i).forEach((i) => run((chat) => chat.send(m.id, `${i}:${big}`)))
  expect(await until(() => kinds(m.ev(), "exit").length === 1)).toBe(true)
  const got = m.stdin().map((l) => at(l, "message", "content"))
  expect(got.length).toBe(52)
  expect(got.slice(0, 2)).toEqual(["first", "second"])
  expect(got.slice(2).every((t, i) => t === `${i}:${big}`)).toBe(true)
  expect(run((chat) => chat.history(m.id)).filter((e) => e.kind === "user").length).toBe(52)
})

test("history is capped and deltas are streamed but not kept", async () => {
  const delta = (t: string) =>
    J({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: t } }, parent_tool_use_id: null })
  const limit = J({ type: "rate_limit_event", rate_limit_info: { unifiedWindows: { five_hour: { utilization: 1 } } } })
  const h = launch([
    { write: delta("d").repeat(100) + limit.repeat(2500) + J({ type: "system", subtype: "session_state_changed", state: "idle" }) },
    { delay: 50 },
    { exit: 0 },
  ])
  await until(() => kinds(h.ev(), "exit").length === 1)
  const hist = run((chat) => chat.history(h.id))
  expect(hist.length).toBe(2000)
  expect(kinds(h.ev(), "text-delta").length).toBe(100)
  expect(hist.at(-2)!.kind).toBe("state")
  expect(hist.at(-1)!.kind).toBe("exit")
})

test("an oversized line yields an error event and framing recovers", async () => {
  const o = launch([
    { big: 9 * 1024 * 1024 },
    { big: 1024 },
    { write: "\n" + J({ type: "system", subtype: "session_state_changed", state: "running" }) },
    { delay: 50 },
    { exit: 0 },
  ])
  await until(() => kinds(o.ev(), "exit").length === 1)
  expect(kinds(o.ev(), "error").length).toBe(1)
  expect(kinds(o.ev(), "state").length).toBe(1)
})

test("stop closes stdin and a healthy child exits 0 promptly", async () => {
  const s1 = launch([{ write: J({ type: "system", subtype: "session_state_changed", state: "idle" }) }, { waitStdin: 99 }])
  await until(() => kinds(s1.ev(), "state").length === 1)
  const t0 = Date.now()
  run((chat) => chat.stop(s1.id))
  await until(() => kinds(s1.ev(), "exit").length === 1)
  expect(item(kinds(s1.ev(), "exit")).code).toBe(0)
  expect(Date.now() - t0).toBeLessThan(1500)
  expect(run((chat) => chat.has(s1.id))).toBe(false)
})

test(
  "stop escalates to SIGKILL for a stuck child (about 5s)",
  async () => {
    const s2 = launch([{ stubborn: true, write: J({ type: "system", subtype: "session_state_changed", state: "idle" }) }])
    await until(() => kinds(s2.ev(), "state").length === 1)
    const t1 = Date.now()
    run((chat) => chat.stop(s2.id))
    await until(() => kinds(s2.ev(), "exit").length === 1, 9000)
    const dt = Date.now() - t1
    expect(item(kinds(s2.ev(), "exit")).code).toBe(null)
    expect(dt).toBeGreaterThanOrEqual(4500)
    expect(dt).toBeLessThan(7500)
  },
  { timeout: 10000 },
)

test("a real denial carries no cancellation reason", async () => {
  const d = launch([
    { write: J({ type: "control_request", request_id: "req_d", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "rm -rf /" }, tool_use_id: "toolu_d" } }) },
    { waitStdin: 1 },
    { delay: 30 },
    { exit: 0 },
  ])
  await until(() => kinds(d.ev(), "permission").length === 1)
  run((chat) => chat.respond(d.id, asRequestId("req_d"), { allow: false }))
  await until(() => kinds(d.ev(), "permission-resolved").length === 1)
  expect(item(kinds(d.ev(), "permission-resolved"))).toEqual({ kind: "permission-resolved", requestId: asRequestId("req_d"), allowed: false })
})

describe("transcript replay", () => {
  const tp = asFilePath(path.join(dir, "transcript.jsonl"))
  const U = "toolu_01Ph2mhcst3kipaet5tvjBg1"
  fs.writeFileSync(
    tp,
    [
      J({ type: "queue-operation", operation: "x", sessionId: "S9" }),
      J({ type: "user", isSidechain: false, message: { role: "user", content: "list the files" }, uuid: "u1" }),
      J({ type: "user", isMeta: true, isSidechain: false, message: { role: "user", content: "[Image: 2x2]" }, uuid: "u2" }),
      "{truncated line\n",
      J({ type: "assistant", isSidechain: false, uuid: "u3", message: { id: "msg_1", role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "sig" }], usage: { output_tokens: 396, output_tokens_details: { thinking_tokens: 317 } } } }),
      J({ type: "assistant", isSidechain: false, uuid: "u4", message: { id: "msg_1", role: "assistant", content: [{ type: "tool_use", id: U, name: "Bash", input: { command: "ls" } }] } }),
      J({ type: "user", isSidechain: false, uuid: "u5", message: { role: "user", content: [{ tool_use_id: U, type: "tool_result", content: "a.txt", is_error: false }] }, toolUseResult: { stdout: "a.txt", stderr: "" } }),
      J({ type: "assistant", isSidechain: true, uuid: "u6", message: { id: "msg_s", role: "assistant", content: [{ type: "text", text: "subagent chatter" }] } }),
      J({ type: "assistant", isSidechain: false, uuid: "u7", message: { id: "msg_2", role: "assistant", content: [{ type: "text", text: "Done." }] } }),
    ].join(""),
  )
  const rebuilt = historyFromTranscript(tp)

  test("yields the live event kinds and shapes in order", () => {
    expect(rebuilt.map((e) => e.kind)).toEqual(["user", "thinking", "tool-start", "tool-end", "text"])
    expect(item(rebuilt, 0)).toMatchObject({ text: "list the files" })
    expect(item(rebuilt, 1)).toMatchObject({ tokens: 317 })
    expect(item(rebuilt, 2)).toMatchObject({ toolUseId: U, title: "Bash: ls", parentToolUseId: null })
    expect(item(rebuilt, 3)).toMatchObject({ content: "a.txt", structured: { stdout: "a.txt" }, isError: false })
    expect(item(rebuilt, 4)).toMatchObject({ text: "Done." })
  })

  test("skips sidechain and meta entries and keeps block ids distinct", () => {
    expect(JSON.stringify(rebuilt)).not.toContain("subagent chatter")
    expect(JSON.stringify(rebuilt)).not.toContain("Image")
    expect(new Set(rebuilt.flatMap((e) => ("block" in e ? [e.block] : []))).size).toBe(2)
  })

  test("a missing transcript is not an error, and replay is capped", () => {
    expect(historyFromTranscript(asFilePath(path.join(dir, "nope.jsonl")))).toEqual([])
    expect(historyFromTranscript(null)).toEqual([])
    const capped = asFilePath(path.join(dir, "long.jsonl"))
    fs.writeFileSync(
      capped,
      J({ type: "user", message: { role: "user", content: "first" }, uuid: "u0" }) +
        J({ type: "user", message: { role: "user", content: "tail" }, uuid: "u1" }).repeat(2100),
    )
    const long = historyFromTranscript(capped)
    expect(long.length).toBe(2000)
    expect(item(long)).toMatchObject({ text: "tail" })
  })

  test("a session started with a transcript serves it as history", async () => {
    const tr = launch([{ write: J({ type: "system", subtype: "init", session_id: "S9", cwd: dir, tools: [], model: "claude-sonnet-4-5" }) }, { delay: 30 }, { exit: 0 }], [], tp)
    await until(() => kinds(tr.ev(), "exit").length === 1)
    const seeded = run((chat) => chat.history(tr.id))
    expect(seeded.length).toBe(rebuilt.length + 2)
    expect(item(seeded)).toMatchObject({ text: "list the files" })
    expect(item(seeded, rebuilt.length).kind).toBe("ready")
  })
})

test("closing the scope kills a stuck child at once", async () => {
  const q = launch([{ stubborn: true, write: J({ type: "system", subtype: "session_state_changed", state: "running" }) }])
  await until(() => kinds(q.ev(), "state").length === 1)
  const pid = Number(fs.readFileSync(q.files.argv + ".pid", "utf8"))
  const alive = () => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  expect(alive()).toBe(true)
  await runtime.dispose()
  // Child killed right away on quit
  expect(await until(() => !alive(), 1000)).toBe(true)
})

test("a spawn failure yields error then exit without throwing", async () => {
  runtime = makeRuntime(path.join(dir, "nope"))
  await listen(runtime)
  const bad = launch([])
  await until(() => kinds(bad.ev(), "exit").length === 1)
  expect(kinds(bad.ev(), "error").length).toBe(1)
  expect(kinds(bad.ev(), "exit").length).toBe(1)
})
