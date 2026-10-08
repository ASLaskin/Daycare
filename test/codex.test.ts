// Codex provider against a fake app-server.

import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { startCodex } from "../src/coordinator/codex.ts"
import { spawnGroup } from "../src/coordinator/process.ts"
import type { ProviderHandle, ProviderUpdate } from "../src/coordinator/provider.ts"
import { asNativeId, type SessionState } from "../src/shared/coordinator.ts"
import { asFilePath, asRequestId } from "../src/shared/ids.ts"
import type { PermissionMode } from "../src/shared/session.ts"
import { sample } from "./fixtures/store.ts"

const FAKE = path.join(import.meta.dir, "fixtures", "fake-codex.ts")
const cleanup: Array<() => unknown> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()))
})

interface Received {
  readonly id?: number | string
  readonly method?: string
  readonly params?: Record<string, unknown>
  readonly result?: unknown
  readonly error?: { readonly message: string }
}

const start = (state: SessionState, nativeId: string | null = null, env: Record<string, string> = {}, permissionMode: PermissionMode = "default", role: "master" | "worker" = "master") => {
  const dir = mkdtempSync(path.join(tmpdir(), "daycare-codex-"))
  const log = path.join(dir, "received.jsonl")
  const received = (): Array<Received> => {
    try {
      return readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
  const updates: Array<ProviderUpdate> = []
  // Methods the fake had received when each update arrived
  const seenAt: Array<ReadonlyArray<string>> = []
  const session = { ...sample("s", "codex", state), nativeId: nativeId ? asNativeId(nativeId) : null, permissionMode, role }
  const fakeSpawn: typeof spawnGroup = (_cmd, args, opts) => spawnGroup(process.execPath, [FAKE, ...args], { ...opts, env: { ...process.env, ...env, LOG: log } })
  const handle: ProviderHandle = startCodex(
    session,
    asFilePath("/unused/codex"),
    (u) => {
      updates.push(u)
      seenAt.push(received().flatMap((m) => (m.method ? [m.method] : [])))
    },
    fakeSpawn,
  )
  cleanup.push(() => handle.close(), () => rmSync(dir, { recursive: true, force: true }))
  return { handle, updates, seenAt, received }
}

const until = async (check: () => boolean) => {
  const deadline = Date.now() + 5000
  while (!check() && Date.now() < deadline) {
    await Bun.sleep(10)
  }
  expect(check()).toBe(true)
}

const kinds = (updates: ReadonlyArray<ProviderUpdate>) => updates.flatMap((u) => (u.type === "event" ? [u.event.kind] : [u.type]))

test("a new thread's id is stored before the first turn is sent", async () => {
  const { handle, updates, seenAt, received } = start("creating")
  handle.input("hi")
  await until(() => kinds(updates).includes("turn-end"))
  const native = updates.findIndex((u) => u.type === "native")
  expect(updates[native]).toEqual({ type: "native", nativeId: asNativeId("thread-1") })
  expect(seenAt[native]).not.toContain("turn/start")
  expect(received().some((m) => m.method === "turn/start")).toBe(true)
  expect(received()[0]?.params?.["capabilities"]).toBeUndefined()
})

test("a turn streams, completes, and unknown notifications are ignored", async () => {
  const { handle, updates } = start("creating")
  handle.input("there")
  await until(() => kinds(updates).includes("turn-end"))
  expect(kinds(updates)).toEqual(["native", "created", "state", "text-delta", "text", "turn-end", "state"])
})

test("an existing thread is resumed by id without reporting a new one", async () => {
  const { handle, updates, received } = start("idle", "thread-9")
  handle.input("again")
  await until(() => kinds(updates).includes("turn-end"))
  expect(updates.some((u) => u.type === "native")).toBe(false)
  expect(received().find((m) => m.method === "thread/resume")?.params?.["threadId"]).toBe("thread-9")
})

test("an approval reaches Codex with the chosen decision", async () => {
  const { handle, updates, received } = start("creating")
  handle.input("please approve")
  await until(() => updates.some((u) => u.type === "approval"))
  const approval = updates.find((u) => u.type === "approval")
  expect(approval?.type === "approval" ? approval.choices : null).toEqual(["accept", "acceptForSession", "decline", "cancel"])
  const request = approval?.type === "approval" ? approval.request : asRequestId("")
  expect(handle.answer(request, { choice: "maybe" })).toBe(false)
  expect(handle.answer(request, { choice: "decline" })).toBe(true)
  expect(handle.answer(request, { choice: "accept" })).toBe(false)
  await until(() => kinds(updates).includes("turn-end"))
  expect(received().find((m) => m.id === 900)?.result).toEqual({ decision: "decline" })
})

test("an unsupported request is answered with an error and reported", async () => {
  const { handle, updates, received } = start("creating")
  handle.input("unsupported")
  await until(() => received().some((m) => m.id === 901))
  expect(received().find((m) => m.id === 901)?.error?.message).toBe("daycare does not support item/tool/call")
  expect(updates).toContainEqual({ type: "error", message: "daycare does not support item/tool/call" })
})

test("interrupt targets the running turn", async () => {
  const { handle, updates, received } = start("creating")
  handle.input("wait")
  await until(() => kinds(updates).includes("state"))
  handle.interrupt()
  await until(() => kinds(updates).includes("turn-end"))
  expect(received().find((m) => m.method === "turn/interrupt")?.params).toEqual({ threadId: "thread-1", turnId: "turn-1" })
})

test("a logged-out Codex is reported and the process ends", async () => {
  const { updates } = start("creating", null, { LOGGED_OUT: "1" })
  await until(() => kinds(updates).includes("exited"))
  expect(updates).toContainEqual({ type: "error", message: "Codex is not logged in. Run `codex login`, then start a new session." })
})

test("an untested Codex version is a notice, not a failure", async () => {
  const { handle, updates } = start("creating", null, { VERSION: "0.161.0" })
  handle.input("hi")
  await until(() => kinds(updates).includes("turn-end"))
  expect(updates[0]).toEqual({ type: "event", event: { kind: "notice", message: "Codex 0.161.0 is untested; Daycare was tested with 0.160.1." } })
})

test("input resolves when Codex accepts the turn and rejects when it refuses", async () => {
  const accepted = start("creating")
  expect(accepted.handle.input("hi")).resolves.toBeUndefined()
  await until(() => kinds(accepted.updates).includes("turn-end"))
  const refused = start("creating", null, { REJECT_TURN: "1" })
  expect(refused.handle.input("hi")).rejects.toThrow("turn refused")
  await until(() => refused.updates.some((u) => u.type === "error"))
})

test("a session whose creation never produced a thread is refused", () => {
  expect(() => startCodex({ ...sample("s", "codex", "incomplete"), nativeId: null }, asFilePath("/unused"), () => {})).toThrow("its creation is incomplete")
})

test("input queued before a failed start is refused with the failure", async () => {
  const { handle, updates } = start("creating", null, { LOGGED_OUT: "1" })
  expect(handle.input("hi")).rejects.toThrow("Codex is not logged in")
  await until(() => kinds(updates).includes("exited"))
  expect(handle.input("later")).rejects.toThrow("codex has stopped")
})

test("a codex binary that cannot start is a session error, not a coordinator crash", async () => {
  const updates: Array<ProviderUpdate> = []
  const handle = startCodex({ ...sample("s", "codex", "creating"), nativeId: null }, asFilePath("/nonexistent/codex"), (u) => updates.push(u))
  const queued = handle.input("hi").then(
    () => "taken",
    (e: Error) => e.message,
  )
  await until(() => kinds(updates).includes("exited"))
  expect(updates.some((u) => u.type === "error" && u.message.includes("ENOENT"))).toBe(true)
  expect(await queued).toBe("codex exited")
})

const policies = (received: () => ReadonlyArray<Received>, method: string) => received().flatMap((m) => (m.method === method ? [m.params?.["approvalPolicy"]] : []))
const notices = (updates: ReadonlyArray<ProviderUpdate>) => updates.flatMap((u) => (u.type === "event" && u.event.kind === "notice" ? [u.event.message] : []))

// acceptEdits maps to on-request, so a fallback to untrusted is visible
test("a bubblewrap warning before the thread makes the thread and every turn untrusted", async () => {
  const { handle, updates, received } = start("creating", null, { WARNING: "early" }, "acceptEdits")
  await handle.input("one")
  await until(() => kinds(updates).includes("turn-end"))
  expect(policies(received, "thread/start")).toEqual(["untrusted"])
  expect(policies(received, "turn/start")).toEqual(["untrusted"])
  expect(notices(updates).filter((n) => n.startsWith("Codex cannot enforce")).length).toBe(1)
})

test("a bubblewrap warning after the thread applies from the next turn", async () => {
  const { handle, updates, received } = start("creating", null, { WARNING: "late" }, "acceptEdits")
  await until(() => notices(updates).some((n) => n.startsWith("Codex cannot enforce")))
  await handle.input("one")
  expect(policies(received, "thread/start")).toEqual(["on-request"])
  expect(policies(received, "turn/start")).toEqual(["untrusted"])
})

test("an unrelated sandbox warning is shown but changes no policy", async () => {
  const { handle, updates, received } = start("creating", null, { WARNING: "other" }, "acceptEdits")
  await handle.input("one")
  await until(() => kinds(updates).includes("turn-end"))
  expect(policies(received, "thread/start")).toEqual(["on-request"])
  expect(policies(received, "turn/start")).toEqual(["on-request"])
  expect(notices(updates)).toEqual(["Codex: sandbox_mode in config.toml is deprecated"])
})

test("a master's thread carries the Daycare bridge; a worker's carries only its prompt", async () => {
  const m = start("creating")
  await m.handle.input("hi")
  const mParams = m.received().find((r) => r.method === "thread/start")?.params
  const daycare = (mParams?.["config"] as { mcp_servers: { daycare: { command: string; args: Array<string>; tool_timeout_sec: number } } } | undefined)?.mcp_servers.daycare
  expect([daycare?.command, daycare?.args[1], daycare?.tool_timeout_sec]).toEqual([process.execPath, "s", 1800])
  expect(String(mParams?.["developerInstructions"])).toStartWith("You are a master session")

  const w = start("creating", null, {}, "default", "worker")
  await w.handle.input("hi")
  const wParams = w.received().find((r) => r.method === "thread/start")?.params
  expect(wParams?.["config"]).toBeUndefined()
  expect(String(wParams?.["developerInstructions"])).toStartWith("You are a worker session")
})
