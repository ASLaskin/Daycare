import { describe, expect, test } from "bun:test"
import { type AgentState, deriveActivity, highlightsFor, isUnlocked } from "../src/renderer/agent-activity.ts"
import { asSessionId } from "../src/shared/ids.ts"
import type { SessionStatus } from "../src/shared/session.ts"

const master = (status: SessionStatus, id = "m"): AgentState => ({ id: asSessionId(id), role: "master", status })
const worker = (status: SessionStatus, id: string): AgentState => ({ id: asSessionId(id), role: "worker", status })

describe("deriveActivity", () => {
  test("nothing open is quiet and locked", () => {
    const activity = deriveActivity([])
    expect(activity).toEqual({ kind: "quiet" })
    expect(isUnlocked(activity)).toBe(false)
  })

  test("any working agent unlocks", () => {
    const activity = deriveActivity([master("idle"), worker("working", "w1")])
    expect(activity).toEqual({ kind: "working" })
    expect(isUnlocked(activity)).toBe(true)
  })

  test("a finished worker keeps it unlocked while the master works", () => {
    expect(isUnlocked(deriveActivity([master("working"), worker("done", "w1")]))).toBe(true)
  })

  test("a finished master keeps it unlocked while a worker works", () => {
    expect(isUnlocked(deriveActivity([master("done"), worker("working", "w1"), worker("done", "w2")]))).toBe(true)
  })

  test("any agent waiting on the user locks, even while others work", () => {
    const activity = deriveActivity([master("working"), worker("needs_you", "w1"), worker("needs_you", "w2")])
    expect(activity).toEqual({ kind: "needs-you", waiting: [asSessionId("w1"), asSessionId("w2")] })
    expect(isUnlocked(activity)).toBe(false)
  })

  test("nothing working or waiting after a turn is all done", () => {
    const activity = deriveActivity([master("done"), worker("done", "w1"), worker("exited", "w2")])
    expect(activity).toEqual({ kind: "all-done" })
    expect(isUnlocked(activity)).toBe(false)
  })

  test("starting and idle agents are not working", () => {
    expect(deriveActivity([master("starting"), worker("idle", "w1")])).toEqual({ kind: "quiet" })
  })
})

describe("highlightsFor", () => {
  test("flashes every waiting agent", () => {
    const activity = deriveActivity([master("working"), worker("needs_you", "w1")])
    expect(highlightsFor(activity, master("working"))).toEqual({ attention: [asSessionId("w1")], finished: [] })
  })

  test("outlines the active master when all are done", () => {
    expect(highlightsFor({ kind: "all-done" }, master("done"))).toEqual({ attention: [], finished: [asSessionId("m")] })
  })

  test("skips an active master that never finished a turn", () => {
    expect(highlightsFor({ kind: "all-done" }, master("idle"))).toEqual({ attention: [], finished: [] })
    expect(highlightsFor({ kind: "all-done" }, null)).toEqual({ attention: [], finished: [] })
  })

  test("highlights nothing while working", () => {
    expect(highlightsFor({ kind: "working" }, master("done"))).toEqual({ attention: [], finished: [] })
  })
})
