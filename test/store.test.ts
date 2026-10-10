// Coordinator session records, migrations and recovery.

import { afterEach, expect, test } from "bun:test"
import { createSession, getSession, loadSessions, patch, recover, startTurn } from "../src/coordinator/store.ts"
import { asNativeId, type SessionState } from "../src/shared/coordinator.ts"
import { asSessionId } from "../src/shared/ids.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const dbs: Array<ReturnType<typeof tempDb>> = []
const fresh = () => {
  const db = tempDb()
  dbs.push(db)
  return db
}
afterEach(() => dbs.splice(0).forEach((db) => db.remove()))

const states = (loaded: ReturnType<typeof loadSessions>) =>
  loaded.map((l) => ("session" in l ? [l.session.id, l.session.state] : ["error", l.error]))

test("reopening keeps records and schema", () => {
  const db = fresh()
  const s = { ...sample("a", "claude", "creating"), nativeId: asNativeId("n") }
  createSession(db.open(), s)
  const conn = db.open()
  expect(conn.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(1)
  expect(getSession(conn, s.id)).toEqual({ session: s })
})

test("recovery marks lost execution without touching settled sessions", () => {
  const conn = fresh().open()
  const cases: ReadonlyArray<readonly [string, SessionState]> = [
    ["a", "running"],
    ["b", "creating"],
    ["c", "idle"],
    ["d", "interrupted"],
    ["e", "creating"],
  ]
  cases.forEach(([id, state]) => createSession(conn, sample(id, "codex", state)))
  conn.run("INSERT INTO history (session_id, seq, scope, block, partial, bytes, body) VALUES ('b', 1, 1, NULL, 0, 2, '{}')")
  expect(recover(conn)).toEqual([asSessionId("a"), asSessionId("b")])
  expect(states(loadSessions(conn))).toEqual([
    ["a", "interrupted"],
    ["b", "incomplete"],
    ["c", "idle"],
    ["d", "interrupted"],
    ["e", "creating"],
  ])
})

test("a bad row does not hide the others", () => {
  const conn = fresh().open()
  createSession(conn, sample("a", "claude", "idle"))
  createSession(conn, sample("b", "codex", "idle"))
  conn.run("UPDATE sessions SET state = 'bogus' WHERE id = 'a'")
  const [bad, good] = loadSessions(conn)
  expect(bad && "error" in bad ? bad.error : null).toStartWith("session a: ")
  expect(good && "session" in good ? good.session.id : null).toBe(asSessionId("b"))
})

test("a turn clears the error and keeps creation pending", () => {
  const conn = fresh().open()
  const id = asSessionId("a")
  createSession(conn, sample("a", "claude", "creating"))
  patch(conn, id, { error: "old" })
  startTurn(conn, id)
  const first = getSession(conn, id)
  expect(first && "session" in first ? [first.session.state, first.session.error] : null).toEqual(["creating", null])
  patch(conn, id, { state: "idle", closed: true })
  startTurn(conn, id)
  const second = getSession(conn, id)
  expect(second && "session" in second ? [second.session.state, second.session.closed] : null).toEqual(["running", true])
})
