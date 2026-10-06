// Fakes at the edges, real services between.

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AppPaths } from "../src/main/AppPaths.ts"
import { Chat } from "../src/main/chat/Chat.ts"
import { ControlEndpoint, ControlHandlers, type HookPayload } from "../src/main/control/ControlServer.ts"
import type { ToolCall } from "../src/main/control/tools.ts"
import { Power, PowerBlocker } from "../src/main/power/Power.ts"
import { ClaudeBinary } from "../src/main/sessions/Claude.ts"
import { Pty, type PtyOptions } from "../src/main/sessions/Pty.ts"
import { Sessions } from "../src/main/sessions/Sessions.ts"
import { SettingsStore } from "../src/main/settings/SettingsStore.ts"
import { Ui } from "../src/main/Ui.ts"
import { Usage, UsageSource } from "../src/main/usage/Usage.ts"
import type { EventChannel, Events } from "../src/shared/ipc.ts"
import type { SessionView } from "../src/shared/session.ts"

// ---------- fakes ----------

interface FakeProc {
  readonly file: string
  readonly args: ReadonlyArray<string>
  readonly options: PtyOptions
  readonly written: Array<string>
  killed: boolean
  exit: () => void
}
const procs: Array<FakeProc> = []

const FakePty = Layer.succeed(
  Pty,
  Pty.of({
    spawn: (file, args, options) => {
      const exits: Array<() => void> = []
      const proc: FakeProc = {
        file,
        args,
        options,
        written: [],
        killed: false,
        exit: () => exits.forEach((f) => f()),
      }
      procs.push(proc)
      return {
        write: (data) => void proc.written.push(data),
        resize: () => {},
        // Killing a PTY reports an exit.
        kill: () => {
          proc.killed = true
          queueMicrotask(proc.exit)
        },
        onData: () => {},
        onExit: (f) => void exits.push(f),
      }
    },
  }),
)

const sent: Array<{ channel: EventChannel; payload: unknown }> = []
let confirmAnswer = true
const FakeUi = Layer.succeed(
  Ui,
  Ui.of({
    send: <C extends EventChannel>(channel: C, payload: Events[C]) => void sent.push({ channel, payload }),
    notify: () => {},
    confirm: () => Effect.succeed(confirmAnswer),
  }),
)

const FakeBlocker = Layer.succeed(PowerBlocker, PowerBlocker.of({ start: () => 1, stop: () => {}, isStarted: () => false }))
const QuietUsage = Layer.succeed(UsageSource, UsageSource.of({ fetch: Effect.succeed([]) }))

const root = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-sessions-"))
const userData = path.join(root, "userData")
const work = path.join(root, "work")
fs.mkdirSync(work, { recursive: true })
const FAKE_CLAUDE = path.join(import.meta.dir, "fixtures", "fake-claude.js")

const makeRuntime = () => {
  const paths = Layer.succeed(AppPaths, AppPaths.of({ userData, appRoot: root, home: root }))
  const endpoint = Layer.succeed(ControlEndpoint, ControlEndpoint.of({ url: "http://127.0.0.1:9", token: "secret-token" }))
  const settings = SettingsStore.layer
  const deps = Layer.mergeAll(
    Chat.layer(FAKE_CLAUDE),
    Power.layer({ osascript: "/usr/bin/false", pmset: "/usr/bin/false", sentinel: path.join(root, "lid"), lidGraceMs: 1000, isMac: false }).pipe(
      Layer.provide(FakeBlocker),
    ),
    settings,
    Usage.layer.pipe(Layer.provide(QuietUsage)),
    FakeUi,
    FakePty,
    Layer.succeed(ClaudeBinary, { path: "/fake/claude" }),
    endpoint,
  ).pipe(Layer.provideMerge(paths))
  return ManagedRuntime.make(Sessions.layer.pipe(Layer.provide(deps)))
}

let runtime = makeRuntime()
const sessions = <A, E>(f: (s: Sessions["Service"]) => Effect.Effect<A, E>) => runtime.runPromise(Sessions.use(f))
const hook = (id: string, payload: HookPayload) => runtime.runPromise(ControlHandlers.use((h) => h.hook(id, payload)))
const tool = (masterId: string, call: ToolCall) => runtime.runPromise(ControlHandlers.use((h) => Effect.result(h.tool(masterId, call))))
const get = (id: string) => sessions((s) => s.get(id)) as Promise<SessionView>
const tick = () => Bun.sleep(5)
const procOf = (id: string) => procs.findLast((p) => p.args.join(" ").includes(`/hook/${id}`))!

afterAll(async () => {
  await runtime.dispose()
  fs.rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  confirmAnswer = true
})

const newMaster = (task = "") =>
  sessions((s) => s.createMaster({ task, kind: "terminal", cwd: work, model: "sonnet", permissionMode: "default" }))

// ---------- tests ----------

describe("launching a terminal master", () => {
  test("spawns claude with HTTP hooks, an MCP config file, and the master prompt", async () => {
    const m = await newMaster("split this up")
    const p = procOf(m.id)
    expect(p.file).toBe("/fake/claude")
    const args = p.args
    const settings = JSON.parse(args[args.indexOf("--settings") + 1]!)
    const pre = settings.hooks.PreToolUse[0]
    expect(pre.matcher).toBe("*")
    expect(pre.hooks[0]).toEqual({
      type: "http",
      url: `http://127.0.0.1:9/hook/${m.id}`,
      headers: { "x-daycare-token": "$DAYCARE_TOKEN" },
      allowedEnvVars: ["DAYCARE_TOKEN"],
      timeout: 10,
    })
    // Token goes via env and file, never argv.
    expect(args.join(" ")).not.toContain("secret-token")
    expect(p.options.env["DAYCARE_TOKEN"]).toBe("secret-token")
    const mcpFile = args[args.indexOf("--mcp-config") + 1]!
    expect(fs.statSync(mcpFile).mode & 0o777).toBe(0o600)
    const mcp = JSON.parse(fs.readFileSync(mcpFile, "utf8")).mcpServers.daycare
    expect(mcp).toEqual({ type: "http", url: `http://127.0.0.1:9/mcp/${m.id}`, headers: { "x-daycare-token": "secret-token" }, timeout: 1800000 })
    expect(args).toContain("--session-id")
    expect(args.slice(args.indexOf("--disallowedTools"), args.indexOf("--disallowedTools") + 3)).toEqual(["--disallowedTools", "Agent", "Task"])
    expect(args.at(-1)).toBe("split this up")
    expect(m.status).toBe("starting")
    expect(sent.some((e) => e.channel === "session:created" && (e.payload as SessionView).id === m.id)).toBe(true)
  })

  test("a master without a task starts at rest", async () => {
    const m = await newMaster()
    expect(m.status).toBe("idle")
  })

  test("CLAUDE_CODE_* is stripped so sessions look top level", async () => {
    process.env["CLAUDE_CODE_SOMETHING"] = "1"
    const m = await newMaster()
    delete process.env["CLAUDE_CODE_SOMETHING"]
    expect(procOf(m.id).options.env["CLAUDE_CODE_SOMETHING"]).toBeUndefined()
  })
})

describe("hooks drive terminal status", () => {
  test("prompt, tool, notification, stop", async () => {
    const m = await newMaster()
    await hook(m.id, { hook_event_name: "UserPromptSubmit" })
    expect((await get(m.id)).status).toBe("working")
    await hook(m.id, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls   -la" } })
    expect((await get(m.id)).activity).toBe("Bash: ls -la")
    await hook(m.id, { hook_event_name: "Notification", message: "Claude needs your permission" })
    expect((await get(m.id)).status).toBe("needs_you")
    await hook(m.id, { hook_event_name: "Stop", last_assistant_message: "\nAll done here.\nMore." })
    const after = await get(m.id)
    expect([after.status, after.activity, after.finishedTurns]).toEqual(["done", "All done here.", 1])
  })

  test("a new transcript path is remembered", async () => {
    const m = await newMaster()
    await hook(m.id, { hook_event_name: "SessionStart", transcript_path: "/t/x.jsonl", session_id: "claude-1" })
    const saved = JSON.parse(fs.readFileSync(path.join(userData, "sessions.json"), "utf8"))
    expect(saved.find((r: any) => r.id === m.id)).toMatchObject({ transcriptPath: "/t/x.jsonl", claudeSessionId: "claude-1" })
  })
})

describe("a master steering workers over MCP", () => {
  test("spawn, list, send, wait, read", async () => {
    const m = await newMaster()
    const spawned = (await tool(m.id, { name: "spawn_subagent", input: { name: "w1", task: "do a thing" } })) as any
    const w = spawned.success
    expect(w.name).toBe("w1")
    const wp = procOf(w.id)
    expect(wp.args.at(-1)).toBe("do a thing")
    expect(wp.args).not.toContain("--mcp-config")

    const list = (await tool(m.id, { name: "list_subagents", input: {} })) as any
    expect(list.success.map((x: any) => x.name)).toEqual(["w1"])

    await hook(w.id, { hook_event_name: "UserPromptSubmit" })
    const waiting = tool(m.id, { name: "wait_for_subagents", input: { workers: ["W1"] } })
    await tick()
    await hook(w.id, { hook_event_name: "Stop", last_assistant_message: "Finished it" })
    const waited = ((await waiting) as any).success
    expect(waited.timedOut).toBe(false)
    expect(waited.workers[0]).toMatchObject({ name: "w1", status: "done", summary: "Finished it" })

    const sentMsg = (await tool(m.id, { name: "send_to_subagent", input: { worker: "w1", message: "again" } })) as any
    expect(sentMsg.success).toEqual({ ok: true, name: "w1" })
    expect(wp.written[0]).toBe("\x1b[200~again\x1b[201~")
    await Bun.sleep(150)
    expect(wp.written[1]).toBe("\r")

    const read = (await tool(m.id, { name: "read_subagent", input: { worker: "w1" } })) as any
    expect(read.success.finalMessage).toBe("Finished it")
  })

  test("waiting times out, and unknown workers and non-masters are errors", async () => {
    const m = await newMaster()
    const w = ((await tool(m.id, { name: "spawn_subagent", input: { name: "slow", task: "t" } })) as any).success
    await hook(w.id, { hook_event_name: "UserPromptSubmit" })
    const waited = ((await tool(m.id, { name: "wait_for_subagents", input: { timeout_seconds: 1 } })) as any).success
    expect(waited.timedOut).toBe(true)
    const missing = (await tool(m.id, { name: "read_subagent", input: { worker: "nope" } })) as any
    expect(missing.failure.message).toBe('No worker "nope". Known workers: slow')
    const fromWorker = (await tool(w.id, { name: "list_subagents", input: {} })) as any
    expect(fromWorker.failure.message).toBe("Only a master session can orchestrate workers")
  })
})

describe("lifecycle", () => {
  test("closing keeps a master and its workers listed, reopening resumes them", async () => {
    const m = await newMaster()
    const w = ((await tool(m.id, { name: "spawn_subagent", input: { name: "kid", task: "t" } })) as any).success
    await sessions((s) => s.close(m.id))
    await tick()
    expect([(await get(m.id)).status, (await get(w.id)).status]).toEqual(["closed", "closed"])
    expect(procOf(m.id).killed).toBe(true)
    const before = procs.length
    await sessions((s) => s.reopen(m.id))
    expect(procs.length).toBe(before + 2)
    expect((await get(m.id)).status).not.toBe("closed")
  })

  test("claude exiting leaves a shell; the shell exiting removes the session and its workers", async () => {
    const m = await newMaster()
    const w = ((await tool(m.id, { name: "spawn_subagent", input: { name: "kid", task: "t" } })) as any).success
    procOf(m.id).exit()
    expect((await get(m.id)).status).toBe("exited")
    const shell = procs.at(-1)!
    expect(shell.args).toEqual(["-l"])
    shell.exit()
    await tick()
    expect(await get(m.id)).toBeNull()
    expect(await get(w.id)).toBeNull()
    expect(sent.some((e) => e.channel === "session:removed" && (e.payload as any).id === w.id)).toBe(true)
  })

  test("delete asks first", async () => {
    const m = await newMaster()
    confirmAnswer = false
    await sessions((s) => s.remove(m.id))
    expect(await get(m.id)).not.toBeNull()
    confirmAnswer = true
    await sessions((s) => s.remove(m.id))
    expect(await get(m.id)).toBeNull()
  })
})

describe("chat sessions", () => {
  test("a chat master runs the headless claude and reports through its stream", async () => {
    const m = await sessions((s) => s.createMaster({ task: "", kind: "chat", cwd: work, model: "", permissionMode: "default" }))
    await sessions((s) => s.chatSend(m.id, "hello"))
    expect((await get(m.id)).status).toBe("working")
    // Unrequested exit, so the session leaves.
    for (let i = 0; i < 100 && (await get(m.id)); i++) await Bun.sleep(20)
    expect(await get(m.id)).toBeNull()
    expect(sent.some((e) => e.channel === "chat:event" && (e.payload as any).id === m.id)).toBe(true)
  })
})

describe("persistence", () => {
  test("quitting saves every session, and the next launch restores them", async () => {
    const m = await newMaster()
    await sessions((s) => s.rename(m.id, "  Keeper  "))
    await runtime.dispose()
    const saved = JSON.parse(fs.readFileSync(path.join(userData, "sessions.json"), "utf8"))
    expect(saved.find((r: any) => r.id === m.id)).toMatchObject({ name: "Keeper", closed: false })

    runtime = makeRuntime()
    await sessions((s) => s.restore)
    const back = await get(m.id)
    expect([back.name, back.status]).toEqual(["Keeper", "idle"])
    // No transcript, so fresh under the same id.
    expect(procOf(m.id).args).toContain("--session-id")
  })

  test("records from an older build without newer fields still load", async () => {
    await runtime.dispose()
    fs.writeFileSync(
      path.join(userData, "sessions.json"),
      JSON.stringify([{ id: "old-1", role: "master", name: "Old", cwd: work, claudeSessionId: "c1", createdAt: 1 }, { garbage: true }]),
    )
    runtime = makeRuntime()
    await sessions((s) => s.restore)
    expect((await sessions((s) => s.list)).map((s) => s.name)).toEqual(["Old"])
  })
})
