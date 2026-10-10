// Sessions service with fakes at its edges.

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, PubSub, Result, Stream } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Accounts } from "../src/main/accounts/Accounts.ts"
import { AppPaths } from "../src/main/AppPaths.ts"
import { Ui } from "../src/main/Ui.ts"
import { Chat, type ChatMessage, type ChatStart } from "../src/main/chat/Chat.ts"
import { ControlHandlers } from "../src/main/control/ControlHandlers.ts"
import { ControlEndpoint } from "../src/main/control/ControlServer.ts"
import type { HookPayload } from "../src/main/control/hook.ts"
import type { ToolCall } from "../src/main/control/tools.ts"
import { Power } from "../src/main/power/Power.ts"
import { PowerBlocker } from "../src/main/power/PowerBlocker.ts"
import { ClaudeBinary } from "../src/main/sessions/Claude.ts"
import { Sessions } from "../src/main/sessions/Sessions.ts"
import { SettingsStore } from "../src/main/settings/SettingsStore.ts"
import { Usage } from "../src/main/usage/Usage.ts"
import { UsageSource } from "../src/main/usage/UsageSource.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import { DEFAULT_ACCOUNT } from "../src/shared/accounts.ts"
import { type AccountId, asClaudeSessionId, asDirPath, asFilePath, asRequestId, asSessionId, asToolUseId, type SessionId } from "../src/shared/ids.ts"
import type { EventChannel, Events } from "../src/shared/ipc.ts"
import { arr, at, type Json, type JsonObject, obj, parseJson, str } from "../src/shared/json.ts"
import type { SessionView } from "../src/shared/session.ts"

interface FakeChat {
  readonly opts: ChatStart
  readonly sent: Array<string>
  stopped: boolean
}
const chats: Array<FakeChat> = []
let publish: (id: SessionId, event: ChatEvent) => void = () => {}
// Resolves once Sessions listens to chat events
let subscribed = Promise.withResolvers<void>()

const liveChat = (id: SessionId) => chats.findLast((c) => c.opts.id === id && !c.stopped)

// Ends a chat the way a dying claude would
const exitChat = (id: SessionId) => {
  const c = liveChat(id)
  if (!c) {
    return
  }
  c.stopped = true
  void subscribed.promise.then(() => publish(id, { kind: "exit", code: 0, stderrTail: "" }))
}

const FakeChatLayer = Layer.effect(
  Chat,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<ChatMessage>()
    publish = (id, event) => void PubSub.publishUnsafe(pubsub, { id, event })
    subscribed = Promise.withResolvers<void>()
    const ready = subscribed
    return Chat.of({
      subscribe: PubSub.subscribe(pubsub).pipe(
        Effect.tap(() => Effect.sync(() => ready.resolve())),
        Effect.map(Stream.fromSubscription),
      ),
      start: (opts) => Effect.sync(() => void chats.push({ opts, sent: [], stopped: false })),
      send: (id, text) => Effect.sync(() => void liveChat(id)?.sent.push(text)),
      interrupt: () => Effect.void,
      respond: () => Effect.succeed(false),
      stop: (id) => Effect.sync(() => exitChat(id)),
      has: (id) => Effect.sync(() => liveChat(id) !== undefined),
      history: () => Effect.succeed([]),
      info: () => Effect.succeed(null),
    })
  }),
)

const sent: Array<{ channel: EventChannel; payload: Events[EventChannel] }> = []

// Session id carried by an event payload
const payloadId = (p: Events[EventChannel]) => (typeof p === "object" && p !== null && "id" in p ? p.id : null)
let confirmAnswer = true
let chooseAnswer = 0
let chooseCalls = 0
const FakeUi = Layer.succeed(
  Ui,
  Ui.of({
    send: <C extends EventChannel>(channel: C, payload: Events[C]) => void sent.push({ channel, payload }),
    notify: () => {},
    confirm: () => Effect.succeed(confirmAnswer),
    choose: () =>
      Effect.sync(() => {
        chooseCalls += 1
        return chooseAnswer
      }),
  }),
)

const FakeBlocker = Layer.succeed(PowerBlocker, PowerBlocker.of({ start: () => 1, stop: () => {}, isStarted: () => false }))
const QuietUsage = Layer.succeed(UsageSource, UsageSource.of({ fetch: () => Effect.succeed([]) }))

const root = asDirPath(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-sessions-")))
const userData = asDirPath(path.join(root, "userData"))
const work = asDirPath(path.join(root, "work"))
fs.mkdirSync(work, { recursive: true })

const makeRuntime = () => {
  const paths = Layer.succeed(AppPaths, AppPaths.of({ userData, appRoot: root, home: root }))
  const endpoint = Layer.succeed(ControlEndpoint, ControlEndpoint.of({ url: "http://127.0.0.1:9", token: "secret-token" }))
  const claude = Layer.succeed(ClaudeBinary, ClaudeBinary.of({ path: asFilePath("/usr/bin/false") }))
  const deps = Layer.mergeAll(
    FakeChatLayer,
    Power.layer({ osascript: "/usr/bin/false", pmset: "/usr/bin/false", sentinel: path.join(root, "lid"), lidGraceMs: 1000, isMac: false }).pipe(
      Layer.provide(FakeBlocker),
    ),
    Usage.layer.pipe(Layer.provide(QuietUsage)),
    Accounts.layer,
  ).pipe(Layer.provideMerge(Layer.mergeAll(SettingsStore.layer, FakeUi, endpoint, claude)), Layer.provideMerge(paths))
  return ManagedRuntime.make(Sessions.layer.pipe(Layer.provideMerge(deps)))
}

let runtime = makeRuntime()
const sessions = <A, E>(f: (s: Sessions["Service"]) => Effect.Effect<A, E>) => runtime.runPromise(Sessions.use(f))
const hook = (id: SessionId, payload: HookPayload) => runtime.runPromise(ControlHandlers.use((h) => h.hook(id, payload)))
const tool = (masterId: SessionId, call: ToolCall) => runtime.runPromise(ControlHandlers.use((h) => Effect.result(h.tool(masterId, call))))
const get = (id: SessionId) => sessions((s) => s.get(id)) as Promise<SessionView>

// Successful tool result, failing the test otherwise
const ok = async (call: ReturnType<typeof tool>): Promise<Json> => {
  const result = await call
  if (Result.isFailure(result)) {
    throw new Error(result.failure.message)
  }
  return result.success
}

// Tool failure message, failing the test on success
const failure = async (call: ReturnType<typeof tool>): Promise<string> => {
  const result = await call
  if (Result.isSuccess(result)) {
    throw new Error("Expected a tool failure")
  }
  return result.failure.message
}

const spawnWorker = async (masterId: SessionId, name: string, task: string) => {
  const w = obj(await ok(tool(masterId, { name: "spawn_subagent", input: { name, task } }))) ?? {}
  return { name: str(w["name"]), id: asSessionId(String(w["id"])) }
}

const readJsonFile = (file: string): Json | null => parseJson(fs.readFileSync(file, "utf8"))

// Saved sessions.json record for one session
const savedRecord = (id: SessionId): JsonObject | null =>
  obj(arr(readJsonFile(path.join(userData, "sessions.json")) ?? undefined).find((r) => at(r, "id") === id))
const tick = () => Bun.sleep(5)
const chatOf = (id: SessionId) => chats.findLast((c) => c.opts.id === id)!
const emit = async (id: SessionId, event: ChatEvent) => {
  await subscribed.promise
  publish(id, event)
  await tick()
}
const turnEnd = (text: string): ChatEvent => ({
  kind: "turn-end",
  isError: false,
  stopReason: null,
  costUsd: 0,
  contextTokens: 0,
  numTurns: 1,
  durationMs: 1,
  text,
})

afterAll(async () => {
  await runtime.dispose()
  fs.rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  confirmAnswer = true
  chooseAnswer = 0
  chooseCalls = 0
})

const newMaster = (task = "") => sessions((s) => s.createMaster({ task, cwd: work, model: "sonnet", permissionMode: "default" }))

describe("launching a master", () => {
  test("starts headless claude with HTTP hooks, an MCP config file, and the master prompt", async () => {
    const m = await newMaster("split this up")
    const c = chatOf(m.id)
    const args = c.opts.args ?? []
    const settings = parseJson(args[args.indexOf("--settings") + 1]!) ?? undefined
    const start = arr(at(settings, "hooks", "SessionStart"))[0]
    expect(arr(at(start, "hooks"))[0]).toEqual({
      type: "http",
      url: `http://127.0.0.1:9/hook/${m.id}`,
      headers: { "x-daycare-token": "$DAYCARE_TOKEN" },
      allowedEnvVars: ["DAYCARE_TOKEN"],
      timeout: 10,
    })
    // Token goes via env and file, never argv.
    expect(args.join(" ")).not.toContain("secret-token")
    expect(c.opts.env["DAYCARE_TOKEN"]).toBe("secret-token")
    const mcpFile = args[args.indexOf("--mcp-config") + 1]!
    expect(fs.statSync(mcpFile).mode & 0o777).toBe(0o600)
    const mcp = at(readJsonFile(mcpFile) ?? undefined, "mcpServers", "daycare")
    expect(mcp).toEqual({ type: "http", url: `http://127.0.0.1:9/mcp/${m.id}`, headers: { "x-daycare-token": "secret-token" }, timeout: 1800000 })
    expect(args).toContain("--session-id")
    expect(args.slice(args.indexOf("--disallowedTools"), args.indexOf("--disallowedTools") + 3)).toEqual(["--disallowedTools", "Agent", "Task"])
    expect(args).not.toContain("split this up")
    expect(c.sent).toEqual(["split this up"])
    expect(m.status).toBe("starting")
    expect(sent.some((e) => e.channel === "session:created" && payloadId(e.payload) === m.id)).toBe(true)
  })

  test("a master without a task starts at rest", async () => {
    const m = await newMaster()
    expect(m.status).toBe("idle")
    expect(chatOf(m.id).sent).toEqual([])
  })

  test("CLAUDE_CODE_* is stripped so sessions look top level", async () => {
    process.env["CLAUDE_CODE_SOMETHING"] = "1"
    const m = await newMaster()
    delete process.env["CLAUDE_CODE_SOMETHING"]
    expect(chatOf(m.id).opts.env["CLAUDE_CODE_SOMETHING"]).toBeUndefined()
  })
})

describe("chat events drive status", () => {
  test("running, tool, permission, turn end", async () => {
    const m = await newMaster()
    await emit(m.id, { kind: "state", state: "running" })
    expect((await get(m.id)).status).toBe("working")
    await emit(m.id, { kind: "tool-start", toolUseId: asToolUseId("t1"), name: "Bash", title: "Bash", input: { command: "ls   -la" }, parentToolUseId: null })
    expect((await get(m.id)).activity).toBe("Bash: ls -la")
    await emit(m.id, {
      kind: "permission",
      requestId: asRequestId("r1"),
      toolUseId: null,
      name: "Bash",
      title: "Bash",
      input: {},
      description: "",
      suggestions: [],
      requiresUserInteraction: false,
    })
    expect((await get(m.id)).status).toBe("needs_you")
    await emit(m.id, turnEnd("\nAll done here.\nMore."))
    const after = await get(m.id)
    expect([after.status, after.activity, after.finishedTurns]).toEqual(["done", "All done here.", 1])
  })

  test("sending a message marks the session working", async () => {
    const m = await newMaster()
    await sessions((s) => s.chatSend(m.id, "hello"))
    expect((await get(m.id)).status).toBe("working")
    expect(chatOf(m.id).sent).toEqual(["hello"])
    expect((await get(m.id)).hadTurn).toBe(true)
    expect(savedRecord(m.id)).toMatchObject({ hadTurn: true })
    expect(sent.some((e) => e.channel === "chat:event" && payloadId(e.payload) === m.id)).toBe(false)
    await emit(m.id, { kind: "state", state: "running" })
    expect(sent.some((e) => e.channel === "chat:event" && payloadId(e.payload) === m.id)).toBe(true)
  })

  test("a hook's transcript path is remembered", async () => {
    const m = await newMaster()
    await hook(m.id, { hook_event_name: "SessionStart", transcript_path: asFilePath("/t/x.jsonl"), session_id: asClaudeSessionId("claude-1") })
    expect(savedRecord(m.id)).toMatchObject({ transcriptPath: "/t/x.jsonl", claudeSessionId: "claude-1" })
  })
})

describe("a master steering workers over MCP", () => {
  test("spawn, list, send, wait, read", async () => {
    const m = await newMaster()
    const w = await spawnWorker(m.id, "w1", "do a thing")
    expect(w.name).toBe("w1")
    const wc = chatOf(w.id)
    expect(wc.sent).toEqual(["do a thing"])
    expect(wc.opts.args).not.toContain("--mcp-config")

    const list = await ok(tool(m.id, { name: "list_subagents", input: {} }))
    expect(arr(list).map((x) => at(x, "name"))).toEqual(["w1"])

    await emit(w.id, { kind: "state", state: "running" })
    const waiting = tool(m.id, { name: "wait_for_subagents", input: { workers: ["W1"] } })
    await tick()
    await emit(w.id, turnEnd("Finished it"))
    const waited = await ok(waiting)
    expect(at(waited, "timedOut")).toBe(false)
    expect(arr(at(waited, "workers"))[0]).toMatchObject({ name: "w1", status: "done", summary: "Finished it" })

    const sentMsg = await ok(tool(m.id, { name: "send_to_subagent", input: { worker: "w1", message: "again" } }))
    expect(sentMsg).toEqual({ ok: true, name: "w1" })
    expect(wc.sent).toEqual(["do a thing", "again"])

    const read = await ok(tool(m.id, { name: "read_subagent", input: { worker: "w1" } }))
    expect(at(read, "finalMessage")).toBe("Finished it")
  })

  test("waiting times out, and unknown or exited workers and non-masters are errors", async () => {
    const m = await newMaster()
    const w = await spawnWorker(m.id, "slow", "t")
    const waited = await ok(tool(m.id, { name: "wait_for_subagents", input: { timeout_seconds: 1 } }))
    expect(at(waited, "timedOut")).toBe(true)
    expect(await failure(tool(m.id, { name: "read_subagent", input: { worker: "nope" } }))).toBe('No worker "nope". Known workers: slow')
    expect(await failure(tool(w.id, { name: "list_subagents", input: {} }))).toBe("Only a master session can orchestrate workers")
    liveChat(w.id)!.stopped = true
    expect(await failure(tool(m.id, { name: "send_to_subagent", input: { worker: "slow", message: "hi" } }))).toBe("slow has exited")
  })
})

describe("lifecycle", () => {
  test("closing keeps a master and its workers listed, reopening resumes them", async () => {
    const m = await newMaster()
    const w = await spawnWorker(m.id, "kid", "t")
    await sessions((s) => s.close(m.id))
    await tick()
    expect([(await get(m.id)).status, (await get(w.id)).status]).toEqual(["closed", "closed"])
    expect(chatOf(m.id).stopped).toBe(true)
    const before = chats.length
    await sessions((s) => s.reopen(m.id))
    expect(chats.length).toBe(before + 2)
    expect((await get(m.id)).status).not.toBe("closed")
  })

  test("claude exiting removes the session and its workers", async () => {
    const m = await newMaster()
    const w = await spawnWorker(m.id, "kid", "t")
    exitChat(m.id)
    await tick()
    expect(await get(m.id)).toBeNull()
    expect(await get(w.id)).toBeNull()
    expect(sent.some((e) => e.channel === "session:removed" && payloadId(e.payload) === w.id)).toBe(true)
  })

  test("delete asks first once a session has history", async () => {
    const m = await newMaster()
    await emit(m.id, turnEnd("hi"))
    confirmAnswer = false
    await sessions((s) => s.remove(m.id))
    expect(await get(m.id)).not.toBeNull()
    confirmAnswer = true
    await sessions((s) => s.remove(m.id))
    expect(await get(m.id)).toBeNull()
  })

  test("delete skips the prompt for a master with no messages", async () => {
    const m = await newMaster()
    expect(m.hadTurn).toBe(false)
    confirmAnswer = false
    await sessions((s) => s.remove(m.id))
    expect(await get(m.id)).toBeNull()
  })

  test("a master started with a task counts as messaged", async () => {
    const m = await newMaster("do the thing")
    expect((await get(m.id)).hadTurn).toBe(true)
  })
})

describe("persistence", () => {
  test("quitting saves every session, and the next launch restores them", async () => {
    const m = await newMaster()
    await sessions((s) => s.rename(m.id, "  Keeper  "))
    await runtime.dispose()
    expect(savedRecord(m.id)).toMatchObject({ name: "Keeper", closed: false })

    runtime = makeRuntime()
    await sessions((s) => s.restore)
    const back = await get(m.id)
    expect([back.name, back.status]).toEqual(["Keeper", "idle"])
    // Fresh start under the same id
    expect(chatOf(m.id).opts.args).toContain("--session-id")
  })

  test("records from older builds, including terminal ones, load as chats", async () => {
    await runtime.dispose()
    fs.writeFileSync(
      path.join(userData, "sessions.json"),
      JSON.stringify([
        { id: "old-1", role: "master", name: "Old", cwd: work, claudeSessionId: "c1", createdAt: 1 },
        { id: "old-2", role: "master", kind: "terminal", name: "Term", cwd: work, claudeSessionId: "c2", createdAt: 2 },
        { garbage: true },
      ]),
    )
    runtime = makeRuntime()
    await sessions((s) => s.restore)
    expect((await sessions((s) => s.list)).map((s) => s.name)).toEqual(["Old", "Term"])
    expect(chatOf(asSessionId("old-2"))).toBeDefined()
    expect(savedRecord(asSessionId("old-2"))).not.toHaveProperty("kind")
  })
})

describe("accounts", () => {
  const addAccount = (label: string) => runtime.runPromise(Accounts.use((a) => a.add(label)))
  const switchTo = (id: AccountId) => sessions((s) => s.switchAccount(id))
  const configEnv = (id: SessionId) => chatOf(id).opts.env["CLAUDE_CONFIG_DIR"]
  const accountDir = (id: AccountId) => path.join(userData, "accounts", id)
  const closeAll = async () => {
    const masters = (await sessions((s) => s.list)).filter((s) => s.role === "master")
    await Promise.all(masters.map((m) => sessions((s) => s.close(m.id))))
    await tick()
  }

  test("new sessions use the active account; running ones keep theirs on a keep switch", async () => {
    await closeAll()
    const workAccount = await addAccount("Work")
    await switchTo(workAccount.id)
    expect(chooseCalls).toBe(0)
    const m = await newMaster()
    expect(configEnv(m.id)).toBe(accountDir(workAccount.id))
    expect(m.accountId).toBe(workAccount.id)
    expect(savedRecord(m.id)).toMatchObject({ accountId: workAccount.id })

    const before = chats.length
    await switchTo(DEFAULT_ACCOUNT)
    expect(chooseCalls).toBe(1)
    expect(chats.length).toBe(before)
    expect(chatOf(m.id).stopped).toBe(false)
    const fresh = await newMaster()
    expect(configEnv(fresh.id)).toBeUndefined()
    expect(fresh.accountId).toBe(DEFAULT_ACCOUNT)
  })

  test("restart stops running sessions and resumes them on the new account with their transcript", async () => {
    await closeAll()
    const workAccount = await addAccount("Side")
    const m = await newMaster()
    expect(m.accountId).toBe(DEFAULT_ACCOUNT)
    const transcript = path.join(root, ".claude", "projects", "-work", "abc.jsonl")
    fs.mkdirSync(path.join(root, ".claude", "projects", "-work", "abc", "subagents"), { recursive: true })
    fs.writeFileSync(transcript, '{"type":"user"}\n')
    await hook(m.id, { hook_event_name: "SessionStart", transcript_path: asFilePath(transcript), session_id: asClaudeSessionId("abc") })

    chooseAnswer = 1
    await switchTo(workAccount.id)
    await tick()
    const moved = path.join(accountDir(workAccount.id), "projects", "-work", "abc.jsonl")
    expect(fs.readFileSync(moved, "utf8")).toBe('{"type":"user"}\n')
    expect(fs.existsSync(path.join(accountDir(workAccount.id), "projects", "-work", "abc", "subagents"))).toBe(true)
    const args = chatOf(m.id).opts.args ?? []
    expect(args.slice(args.indexOf("--resume"), args.indexOf("--resume") + 2)).toEqual(["--resume", "abc"])
    expect(configEnv(m.id)).toBe(accountDir(workAccount.id))
    expect((await get(m.id)).accountId).toBe(workAccount.id)
    expect(savedRecord(m.id)).toMatchObject({ accountId: workAccount.id, transcriptPath: moved })
  })

  test("cancel leaves the active account alone", async () => {
    const active = (await runtime.runPromise(SettingsStore.use((s) => s.get))).activeAccount
    chooseAnswer = 2
    const next = await switchTo(DEFAULT_ACCOUNT)
    expect(next.activeAccount).toBe(active)
  })

  test("an account in use cannot be removed; once closed its sessions move to Default", async () => {
    const { activeAccount } = await runtime.runPromise(SettingsStore.use((s) => s.get))
    const m = await newMaster()
    expect(m.accountId).toBe(activeAccount)
    await expect(sessions((s) => s.removeAccount(activeAccount))).rejects.toThrow("running on")
    await closeAll()
    const next = await sessions((s) => s.removeAccount(activeAccount))
    expect(next.accounts.some((a) => a.id === activeAccount)).toBe(false)
    expect(next.activeAccount).toBe(DEFAULT_ACCOUNT)
    expect((await get(m.id)).accountId).toBe(DEFAULT_ACCOUNT)
    expect(fs.existsSync(accountDir(activeAccount))).toBe(false)
  })

  test("restored sessions start on the account they were saved with", async () => {
    await closeAll()
    const workAccount = await addAccount("Again")
    await switchTo(workAccount.id)
    const m = await newMaster()
    await switchTo(DEFAULT_ACCOUNT)
    await runtime.dispose()
    runtime = makeRuntime()
    await sessions((s) => s.restore)
    expect(configEnv(m.id)).toBe(accountDir(workAccount.id))
  })
})
