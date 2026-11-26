// Session group edits and the coordinator's groups command.

import { afterEach, expect, test } from "bun:test"
import { makeHub } from "../src/coordinator/hub.ts"
import { createSession } from "../src/coordinator/store.ts"
import type { HubEvent } from "../src/shared/coordinator.ts"
import { dissolveGroup, dropOnGroup, dropOnSession, editGroup, nextColor, type SessionGroup, ungroupSession } from "../src/shared/groups.ts"
import { asGroupId, asSessionId, type SessionId } from "../src/shared/ids.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const a = asSessionId("a")
const b = asSessionId("b")
const c = asSessionId("c")
const d = asSessionId("d")
const fresh = (id: string) => ({ id: asGroupId(id), pick: () => 0 })
const group = (id: string, members: ReadonlyArray<SessionId>, color: SessionGroup["color"] = "blue"): SessionGroup => ({
  id: asGroupId(id),
  name: `Group ${id}`,
  color,
  collapsed: false,
  members,
})

test("dropping on an ungrouped session forms a group with the least used color", () => {
  const groups = dropOnSession([group("1", [c, d], "blue")], a, b, fresh("2"))
  expect(groups[1]).toEqual({ id: asGroupId("2"), name: "Group 2", color: "green", collapsed: false, members: [b, a] })
})

test("dropping on a grouped session joins its group and leaves the old one", () => {
  const groups = dropOnSession([group("1", [a, b]), group("2", [c, d])], a, c, fresh("3"))
  expect(groups).toEqual([group("2", [c, d, a])])
})

test("dropping on itself or its own group changes nothing", () => {
  const groups = [group("1", [a, b])]
  expect(dropOnSession(groups, a, a, fresh("2"))).toBe(groups)
  expect(dropOnGroup(groups, a, asGroupId("1"))).toBe(groups)
})

test("ungrouping dissolves a group left with one member", () => {
  expect(ungroupSession([group("1", [a, b, c])], a)).toEqual([group("1", [b, c])])
  expect(ungroupSession([group("1", [a, b])], a)).toEqual([])
})

test("group edits apply to one group", () => {
  const groups = [group("1", [a, b]), group("2", [c, d])]
  expect(editGroup(groups, asGroupId("2"), { collapsed: true, name: "Work" })[1]).toMatchObject({ collapsed: true, name: "Work" })
  expect(dissolveGroup(groups, asGroupId("1"))).toEqual([group("2", [c, d])])
  expect(nextColor("teal")).toBe("blue")
})

const dbs: Array<ReturnType<typeof tempDb>> = []
afterEach(() => dbs.splice(0).forEach((db) => db.remove()))

const hubWith = (ids: ReadonlyArray<string>) => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  ids.forEach((id) => createSession(conn, sample(id, "claude", "idle")))
  const hub = makeHub(conn, () => {
    throw new Error("no launches")
  })
  return { db, conn, hub }
}

test("the coordinator stores groups, drops unknown sessions and broadcasts", () => {
  const { conn, hub } = hubWith(["a", "b", "c"])
  const events: Array<HubEvent> = []
  hub.observe((_, event) => events.push(event))
  expect(hub.command({ method: "groups", groups: [group("1", [a, b, d]), group("2", [c, d])] })).toEqual({ result: {} })
  expect(hub.state().groups).toEqual([group("1", [a, b])])
  expect(events).toEqual([{ kind: "groups", groups: [group("1", [a, b])] }])
  expect(makeHub(conn, () => {
    throw new Error("no launches")
  }).state().groups).toEqual([group("1", [a, b])])
})

test("removing a member updates its group", () => {
  const { hub } = hubWith(["a", "b", "c"])
  hub.command({ method: "groups", groups: [group("1", [a, b, c])] })
  hub.command({ method: "remove", session: c })
  expect(hub.state().groups).toEqual([group("1", [a, b])])
  hub.command({ method: "remove", session: b })
  expect(hub.state().groups).toEqual([])
})
