// Hub ownership: approvals, ordered events, subscribers and recovery.

import { afterEach, expect, test } from "bun:test"
import { loadHistory, record } from "../src/coordinator/history.ts"
import { type Launch, makeHub, type Subscriber } from "../src/coordinator/hub.ts"
import type { Answer, ProviderUpdate } from "../src/coordinator/provider.ts"
import { createSession } from "../src/coordinator/store.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import type { ServerMessage, SessionState } from "../src/shared/coordinator.ts"
import { asNativeId } from "../src/shared/coordinator.ts"
import { asRequestId, asSessionId } from "../src/shared/ids.ts"
import { obj } from "../src/shared/json.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const id = asSessionId("s")
const dbs: Array<ReturnType<typeof tempDb>> = []
afterEach(() => dbs.splice(0).forEach((db) => db.remove()))

// Fake providers: each launch records its inputs and answers and exposes its update callback
const fakeLaunch = () => {
  const launches: Array<{ inputs: Array<string>; answers: Array<Answer>; closed: boolean; update: (u: ProviderUpdate) => void }> = []
  const launch: Launch = (_session, update) => {
    const p = { inputs: new Array<string>(), answers: new Array<Answer>(), closed: false, update }
    launches.push(p)
    return {
      input: async (text) => {
        p.inputs.push(text)
      },
      interrupt: () => {},
      answer: (_request, answer) => {
        if (!["accept", "decline"].includes(answer.choice)) {
          return false
        }
        p.answers.push(answer)
        return true
      },
      close: async () => {
        p.closed = true
      },
    }
  }
  return { launch, launches }
}

const setup = (state: SessionState = "idle") => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", state), nativeId: asNativeId("n") })
  const fake = fakeLaunch()
  const hub = makeHub(conn, fake.launch)
  return { conn, hub, fake }
}

const permission = (request: string): ChatEvent => ({
  kind: "permission",
  requestId: asRequestId(request),
  toolUseId: null,
  name: "Bash",
  title: "Bash",
  input: {},
  description: "",
  suggestions: [],
  requiresUserInteraction: false,
})

const approval = (update: (u: ProviderUpdate) => void, request: string) =>
  update({ type: "approval", request: asRequestId(request), choices: ["accept", "decline"], event: permission(request) })

const answer = (hub: ReturnType<typeof makeHub>, request: string, choice: string) =>
  hub.command({ method: "answer", session: id, request: asRequestId(request), choice })

// Running session with one launched fake provider
const running = () => {
  const ctx = setup()
  expect(ctx.hub.command({ method: "send", session: id, text: "go" })).toEqual({ result: { accepted: "coordinator" } })
  const provider = ctx.fake.launches[0]
  if (!provider) {
    throw new Error("no provider launched")
  }
  return { ...ctx, provider }
}

test("send launches once, hands over input and answers with coordinator acceptance only", () => {
  const { hub, fake, provider } = running()
  hub.command({ method: "send", session: id, text: "again" })
  expect(fake.launches.length).toBe(1)
  expect(provider.inputs).toEqual(["go", "again"])
})

test("the first valid answer wins", () => {
  const { hub, provider } = running()
  approval(provider.update, "r")
  expect(answer(hub, "r", "maybe")).toEqual({ error: "maybe is not an offered choice" })
  expect(answer(hub, "r", "decline")).toEqual({ result: {} })
  expect(answer(hub, "r", "accept")).toEqual({ error: "approval is not pending" })
  expect(provider.answers).toEqual([{ choice: "decline" }])
})

test("approvals outlive the turn but not the provider", () => {
  const { hub, provider } = running()
  approval(provider.update, "background")
  provider.update({ type: "event", event: { kind: "turn-end", isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text: "" } })
  expect(answer(hub, "background", "accept")).toEqual({ result: {} })
  approval(provider.update, "r")
  provider.update({ type: "exited" })
  expect(answer(hub, "r", "accept")).toEqual({ error: "approval is not pending" })
  const snapshot = hub.subscribe(() => true)
  expect(snapshot.sessions[0]?.state).toBe("idle")
  expect(snapshot.sessions[0]?.live).toBe(false)
})

test("subscribers get a snapshot, then every later event in order", () => {
  const { hub, provider } = running()
  provider.update({ type: "event", event: { kind: "text", block: "b", text: "before" } })
  approval(provider.update, "r")
  const received: Array<ServerMessage> = []
  const snapshot = hub.subscribe((msg) => received.push(msg) > 0)
  const history = snapshot.history[id]
  expect(history && "events" in history ? history.events.map((e) => e.kind) : null).toEqual(["user", "text", "permission"])
  expect(snapshot.approvals.map((a) => a.request)).toEqual([asRequestId("r")])
  provider.update({ type: "event", event: { kind: "text", block: "c", text: "after" } })
  expect(received[0]).toEqual({ type: "event", seq: snapshot.seq + 1, event: { kind: "chat", session: id, event: { kind: "text", block: "c", text: "after" } } })
})

test("a subscriber that can take no more is dropped", () => {
  const { hub, provider } = running()
  let calls = 0
  const full: Subscriber = () => {
    calls += 1
    return false
  }
  hub.subscribe(full)
  provider.update({ type: "event", event: { kind: "rate-limit", percent: 1 } })
  provider.update({ type: "event", event: { kind: "rate-limit", percent: 2 } })
  expect(calls).toBe(1)
})

test("history is recorded under the provider's run", () => {
  const { conn, provider } = running()
  provider.update({ type: "event", event: { kind: "text-delta", block: "m1:0", text: "Hel" } })
  const scopes = conn.query<{ scope: number }, []>("SELECT DISTINCT scope FROM history").all()
  expect(scopes).toEqual([{ scope: 1 }])
  expect(loadHistory(conn, id)).toEqual({ evicted: false, events: [{ kind: "user", text: "go" }, { kind: "text-delta", block: "m1:0", text: "Hel" }] })
})

test("closing stops the provider, withdraws approvals and refuses input", () => {
  const { hub, provider } = running()
  approval(provider.update, "r")
  expect(hub.command({ method: "close", session: id })).toEqual({ result: {} })
  expect(provider.closed).toBe(true)
  expect(hub.subscribe(() => true).approvals).toEqual([])
  expect(hub.command({ method: "send", session: id, text: "more" })).toEqual({ error: "session is closed" })
})

test("restart restores records as interrupted without launching providers", () => {
  const { hub, fake } = setup("running")
  const snapshot = hub.subscribe(() => true)
  expect(snapshot.sessions.map((s) => [s.state, s.live])).toEqual([["interrupted", false]])
  expect(fake.launches).toEqual([])
})

test("a codex session starts without a native id and stores the reported one before update returns", () => {
  const { conn, hub, fake } = setup()
  const created = hub.command({ method: "create", provider: "codex", cwd: sample("x", "codex", "idle").cwd, prompt: "go", model: null, permissionMode: "default" })
  const session = "result" in created ? obj(created.result)?.["session"] : null
  const row = () => conn.query<{ native_id: string | null }, [string]>("SELECT native_id FROM sessions WHERE id = ?").get(String(session))
  expect(row()?.native_id).toBeNull()
  fake.launches.at(-1)?.update({ type: "native", nativeId: asNativeId("thread-1") })
  expect(row()?.native_id).toBe("thread-1")
})

test("shutdown refuses new work at once, is idempotent, and survives a failing close", async () => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("a", "claude", "idle"), nativeId: asNativeId("na") })
  createSession(conn, { ...sample("b", "claude", "idle"), nativeId: asNativeId("nb") })
  let closes = 0
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const hub = makeHub(conn, (session) => ({
    input: async () => {},
    interrupt: () => {},
    answer: () => false,
    close: async () => {
      closes += 1
      await gate
      if (session.id === asSessionId("a")) {
        throw new Error("close failed")
      }
    },
  }))
  hub.command({ method: "send", session: asSessionId("a"), text: "go" })
  hub.command({ method: "send", session: asSessionId("b"), text: "go" })
  const first = hub.shutdown()
  expect(hub.shutdown()).toBe(first)
  expect(hub.command({ method: "send", session: asSessionId("a"), text: "late" })).toEqual({ error: "coordinator is stopping" })
  release()
  await first
  expect(closes).toBe(2)
})

test("updates from a run that is no longer live keep their run and change no state", () => {
  const { conn, hub, fake, provider: first } = running()
  first.update({ type: "exited" })
  hub.command({ method: "send", session: id, text: "second run" })
  expect(fake.launches.length).toBe(2)
  first.update({ type: "event", event: { kind: "text", block: "late", text: "from run 1" } })
  approval(first.update, "late")
  first.update({ type: "event", event: { kind: "turn-end", isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text: "" } })
  const scope = conn.query<{ scope: number }, []>("SELECT scope FROM history WHERE body LIKE '%from run 1%'").get()
  expect(scope?.scope).toBe(1)
  const snapshot = hub.subscribe(() => true)
  expect(snapshot.approvals).toEqual([])
  expect(snapshot.sessions[0]?.state).toBe("running")
  expect(snapshot.sessions[0]?.run).toBe(2)
})

test("a snapshot over its budget leaves out the oldest histories, not the newest", () => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("old", "claude", "idle"), createdAt: 1 })
  createSession(conn, { ...sample("new", "claude", "idle"), createdAt: 2 })
  const hub = makeHub(conn, fakeLaunch().launch)
  const text = "x".repeat(1000)
  ;["old", "new"].forEach((s) => record(conn, asSessionId(s), 1, { kind: "text", block: "b", text }))
  const snapshot = hub.subscribe(() => true, 1500)
  expect(snapshot.history["new"]).toEqual({ evicted: false, events: [{ kind: "text", block: "b", text }] })
  expect(snapshot.history["old"]).toEqual({ error: "history not included: the snapshot is over its size limit" })
})

const interruptions = (conn: ReturnType<ReturnType<typeof tempDb>["open"]>) => {
  const h = loadHistory(conn, id)
  return "events" in h ? h.events.flatMap((e) => (e.kind === "interrupted" ? [e.reason] : [])) : []
}

test("a provider lost mid-turn records an interruption; an idle one does not", () => {
  const { conn, provider } = running()
  provider.update({ type: "exited" })
  expect(interruptions(conn)).toEqual(["the provider stopped"])
  const idle = running()
  idle.provider.update({ type: "event", event: { kind: "turn-end", isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text: "" } })
  idle.provider.update({ type: "exited" })
  expect(interruptions(idle.conn)).toEqual([])
})

test("a restart records each lost turn once", () => {
  const db = tempDb()
  dbs.push(db)
  createSession(db.open(), { ...sample("s", "claude", "running"), nativeId: asNativeId("n") })
  makeHub(db.open(), fakeLaunch().launch)
  makeHub(db.open(), fakeLaunch().launch)
  expect(interruptions(db.open())).toEqual(["the coordinator restarted"])
})

test("shutdown records the turns it stops", async () => {
  const { conn, hub } = running()
  await hub.shutdown()
  expect(interruptions(conn)).toEqual(["the coordinator stopped"])
})

// Master "s" running with one spawned worker
const withWorker = async () => {
  const ctx = running()
  const r = await ctx.hub.tool(id, "spawn_subagent", { name: "w", task: "go" }, new AbortController().signal)
  const worker = asSessionId(String("result" in r ? obj(r.result)?.["id"] : ""))
  return { ...ctx, worker }
}

test("close stops a master and its workers; reopen brings them back without starting agents", async () => {
  const { hub, fake, worker } = await withWorker()
  expect(hub.command({ method: "close", session: id })).toEqual({ result: {} })
  expect(fake.launches.every((l) => l.closed)).toBe(true)
  const closed = hub.subscribe(() => true).sessions
  expect(closed.map((s) => [s.id, s.closed, s.live])).toEqual([
    [id, true, false],
    [worker, true, false],
  ])
  const launches = fake.launches.length
  hub.command({ method: "reopen", session: id })
  expect(hub.subscribe(() => true).sessions.map((s) => s.closed)).toEqual([false, false])
  expect(fake.launches.length).toBe(launches)
})

test("rename trims and ignores an empty name", () => {
  const { hub } = setup()
  hub.command({ method: "rename", session: id, name: "  Planner  " })
  hub.command({ method: "rename", session: id, name: "   " })
  expect(hub.subscribe(() => true).sessions[0]?.name).toBe("Planner")
})

test("removing a master deletes it, its workers and their history; removing a worker keeps the master", async () => {
  const { conn, hub, worker } = await withWorker()
  const second = await hub.tool(id, "spawn_subagent", { name: "w2", task: "go" }, new AbortController().signal)
  const w2 = asSessionId(String("result" in second ? obj(second.result)?.["id"] : ""))
  const events: Array<ServerMessage> = []
  hub.subscribe((m) => events.push(m) > 0)
  hub.command({ method: "remove", session: w2 })
  expect(hub.subscribe(() => true).sessions.map((s) => s.id)).toEqual([id, worker])
  hub.command({ method: "remove", session: id })
  expect(hub.subscribe(() => true).sessions).toEqual([])
  const removed = events.flatMap((m) => (m.type === "event" && m.event.kind === "removed" ? [m.event.session] : []))
  expect(removed).toEqual([w2, worker, id])
  expect(conn.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM history").get()?.n).toBe(0)
  expect(conn.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sessions").get()?.n).toBe(0)
})

test("a wait on a worker that is removed answers instead of failing", async () => {
  const { hub, worker } = await withWorker()
  const waiting = hub.tool(id, "wait_for_subagents", {}, new AbortController().signal)
  hub.command({ method: "remove", session: worker })
  const r = await waiting
  expect("result" in r ? obj(r.result)?.["workers"] : null).toEqual([{ id: worker, removed: true }])
})

test("a saved permission event carries the request's choices for replay", () => {
  const { conn, provider } = running()
  approval(provider.update, "r")
  const h = loadHistory(conn, id)
  const saved = "events" in h ? h.events.find((e) => e.kind === "permission") : undefined
  expect(saved?.kind === "permission" ? saved.choices : null).toEqual(["accept", "decline"])
})

test("a new master keeps the client's sprite, and never gets an empty name", () => {
  const { hub } = setup()
  const cwd = sample("x", "claude", "idle").cwd
  hub.command({ method: "create", provider: "claude", cwd, prompt: "", name: "Kernel Sanders", icon: "mudkip", model: null, permissionMode: "default" })
  hub.command({ method: "create", provider: "claude", cwd, prompt: "", model: null, permissionMode: "default" })
  const created = hub.subscribe(() => true).sessions.filter((s) => s.id !== id)
  expect(created.map((s) => [s.name, s.icon])).toEqual([
    ["Kernel Sanders", "mudkip"],
    ["Master", null],
  ])
})

test("a removed session ignores everything its stopping provider still sends", () => {
  const { conn, hub, provider } = running()
  hub.command({ method: "remove", session: id })
  expect(() => {
    provider.update({ type: "event", event: { kind: "text", block: "late", text: "after removal" } })
    provider.update({ type: "error", message: "late error" })
    provider.update({ type: "native", nativeId: asNativeId("late-thread") })
    approval(provider.update, "late")
    provider.update({ type: "exited" })
  }).not.toThrow()
  expect(conn.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM history").get()?.n).toBe(0)
  expect(hub.subscribe(() => true).sessions).toEqual([])
})

test("a reopened session cannot start a new provider until the old one has stopped", async () => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", "idle"), nativeId: asNativeId("n") })
  let release = () => {}
  const stopped = new Promise<void>((resolve) => {
    release = resolve
  })
  let launches = 0
  const hub = makeHub(conn, () => {
    launches += 1
    return { input: async () => {}, interrupt: () => {}, answer: () => false, close: () => stopped }
  })
  hub.command({ method: "send", session: id, text: "first" })
  hub.command({ method: "close", session: id })
  hub.command({ method: "reopen", session: id })
  expect(hub.command({ method: "send", session: id, text: "too soon" })).toEqual({ error: "the session's previous provider has not stopped yet; try again shortly, or restart the coordinator to recover" })
  release()
  await stopped
  await Bun.sleep(0)
  expect(hub.command({ method: "send", session: id, text: "now" })).toEqual({ result: { accepted: "coordinator" } })
  expect(launches).toBe(2)
})

// A provider whose close the test settles
const closable = () => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", "idle"), nativeId: asNativeId("n") })
  let settle: (failed: boolean) => void = () => {}
  const closed = new Promise<void>((resolve, reject) => {
    settle = (failed) => (failed ? reject(new Error("did not exit")) : resolve())
  })
  const hub = makeHub(conn, () => ({ input: async () => {}, interrupt: () => {}, answer: () => false, close: () => closed }))
  return { hub, settle, closed }
}

test("a close that fails keeps the session from starting another provider", async () => {
  const { hub, settle, closed } = closable()
  hub.command({ method: "send", session: id, text: "first" })
  hub.command({ method: "close", session: id })
  hub.command({ method: "reopen", session: id })
  settle(true)
  await closed.catch(() => {})
  await Bun.sleep(0)
  expect(hub.command({ method: "send", session: id, text: "again" })).toEqual({
    error: "the session's previous provider has not stopped yet; try again shortly, or restart the coordinator to recover",
  })
})

test("shutdown also waits for a close that started earlier", async () => {
  const { hub, settle } = closable()
  hub.command({ method: "send", session: id, text: "first" })
  hub.command({ method: "close", session: id })
  let done = false
  const stopping = hub.shutdown().then(() => {
    done = true
  })
  await Bun.sleep(10)
  expect(done).toBe(false)
  settle(false)
  await stopping
  expect(done).toBe(true)
})
