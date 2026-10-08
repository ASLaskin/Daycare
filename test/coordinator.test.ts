// Electron's coordinator client and its record mapping.

import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { makeHub } from "../src/coordinator/hub.ts"
import { listen, socketPath } from "../src/coordinator/server.ts"
import { createSession } from "../src/coordinator/store.ts"
import { connect } from "../src/main/coordinator/client.ts"
import { pick, view } from "../src/main/coordinator/view.ts"
import type { HubEvent, LiveSession, Snapshot } from "../src/shared/coordinator.ts"
import { asNativeId } from "../src/shared/coordinator.ts"
import { asSessionId } from "../src/shared/ids.ts"
import type { CoordinatorStatus } from "../src/shared/ipc.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const cleanup: Array<() => unknown> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()))
})

describe("pick", () => {
  test("allow takes the narrowest offered approval", () => {
    expect(pick(["allow", "always", "deny"], { allow: true })).toBe("allow")
    expect(pick(["accept", "acceptForSession", "decline", "cancel"], { allow: true })).toBe("accept")
  })

  test("always applies only when the renderer asked for it", () => {
    expect(pick(["allow", "always", "deny"], { allow: true, updatedPermissions: [{}] })).toBe("always")
    expect(pick(["accept", "acceptForSession"], { allow: true, updatedPermissions: [{}] })).toBe("acceptForSession")
  })

  test("deny uses the request's own refusal, and nothing when none is offered", () => {
    expect(pick(["accept", "acceptWithExecpolicyAmendment", "cancel"], { allow: false })).toBe("cancel")
    expect(pick(["allow", "deny"], { allow: false })).toBe("deny")
    expect(pick(["accept"], { allow: false })).toBeNull()
  })
})

test("view maps coordinator state to renderer status", () => {
  const record: LiveSession = { ...sample("s", "claude", "running"), live: true }
  expect(view(record).status).toBe("working")
  expect(view({ ...record, state: "idle" }).status).toBe("done")
  expect(view({ ...record, state: "creating" }).status).toBe("starting")
  expect(view({ ...record, state: "creating", live: false }).status).toBe("idle")
  expect(view({ ...record, state: "incomplete" }).status).toBe("exited")
  expect(view({ ...record, closed: true }).status).toBe("closed")
})

// Coordinator on a temp socket with one idle session and an inert provider
const serve = async () => {
  const runtime = path.join(mkdtempSync(path.join(tmpdir(), "daycare-run-")), "daycare")
  const db = tempDb()
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", "idle"), nativeId: asNativeId("n") })
  const hub = makeHub(conn, () => ({ input: async () => {}, interrupt: () => {}, answer: () => false, close: async () => {} }))
  const server = await listen(runtime, () => hub, "1.0.0")
  cleanup.push(() => server.close(), () => db.remove(), () => rmSync(path.dirname(runtime), { recursive: true, force: true }))
  return runtime
}

const until = async (check: () => boolean) => {
  const deadline = Date.now() + 5000
  while (!check() && Date.now() < deadline) {
    await Bun.sleep(5)
  }
}

test("the client decodes the snapshot, events and responses", async () => {
  const runtime = await serve()
  const snapshots: Array<Snapshot> = []
  const events: Array<HubEvent> = []
  const client = connect(socketPath(runtime), "1.0.0", { snapshot: (s) => snapshots.push(s), event: (e) => events.push(e), status: () => {} })
  cleanup.push(client.close)
  await until(() => snapshots.length > 0)
  expect(snapshots[0]?.sessions.map((s) => s.id)).toEqual([asSessionId("s")])
  expect(await client.request({ method: "send", session: asSessionId("s"), text: "hi" })).toEqual({ accepted: "coordinator" })
  expect(events.some((e) => e.kind === "chat" && e.event.kind === "user")).toBe(true)
  expect(client.request({ method: "interrupt", session: asSessionId("missing") })).rejects.toThrow("session is not running")
})

test("a version mismatch is reported as a status", async () => {
  const runtime = await serve()
  const statuses: Array<CoordinatorStatus> = []
  const client = connect(socketPath(runtime), "0.9.0", { snapshot: () => {}, event: () => {}, status: (s) => statuses.push(s) })
  cleanup.push(client.close)
  await until(() => statuses.some((s) => s.state === "mismatch"))
  expect(statuses).toContainEqual({ state: "mismatch", coordinator: "1.0.0", app: "0.9.0" })
})
