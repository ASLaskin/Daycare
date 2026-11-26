// Phone gateway wire contract.

import { describe, expect, test } from "bun:test"
import { Exit, Schema } from "effect"
import { Command } from "../src/shared/coordinator.ts"
import { asFilePath, asSessionId } from "../src/shared/ids.ts"
import { ActivityState, mediaUrlPath, MobileClientMessage, MobileServerMessage } from "../src/shared/mobile.ts"

const decodeClient = Schema.decodeUnknownExit(Schema.fromJsonString(MobileClientMessage))
const decodeServer = Schema.decodeUnknownExit(MobileServerMessage)
const client = (msg: object) => decodeClient(JSON.stringify(msg))

describe("mobile client messages", () => {
  test("hello carries protocol, token, device and an optional resume point", () => {
    const hello = { type: "hello", protocol: 1, app: "1.0 (1)", token: "t", device: "d", resume: { epoch: "e", seq: 3 } }
    expect(Exit.isSuccess(client(hello))).toBe(true)
    expect(Exit.isSuccess(client({ ...hello, resume: { epoch: "e", seq: 1.5 } }))).toBe(false)
  })

  test("a keyed send with uploaded files decodes", () => {
    const send = { type: "request", id: 1, key: "k", command: { method: "send", session: "s", text: "hi", files: ["/a.png"] } }
    expect(Exit.isSuccess(client(send))).toBe(true)
  })

  test("desktop only commands are refused", () => {
    const tool = { type: "request", id: 1, command: { method: "tool", master: "m", name: "x", input: {} } }
    const move = { type: "request", id: 2, command: { method: "move", session: "s", accountId: "a", configDir: null } }
    expect(Exit.isSuccess(client(tool))).toBe(false)
    expect(Exit.isSuccess(client(move))).toBe(true)
  })
})

describe("mobile server messages", () => {
  test("power events and coded errors decode", () => {
    const battery = { percent: 80, pluggedIn: false, charging: false, minutesRemaining: null, readAt: 1 }
    const power = { mode: "always", holding: true, busyCount: 1, battery, lidClosed: { enabled: true, active: false }, error: null }
    expect(Exit.isSuccess(decodeServer({ type: "event", seq: 2, event: { kind: "power", power } }))).toBe(true)
    expect(Exit.isSuccess(decodeServer({ type: "response", id: 1, error: { code: "rejected", message: "x" } }))).toBe(true)
    expect(Exit.isSuccess(decodeServer({ type: "response", id: 1, error: { code: "nope", message: "x" } }))).toBe(false)
  })

  test("live activity state decodes", () => {
    const state = { running: [{ id: "s", name: "Ada", master: null, since: 1 }], runningCount: 1, approvals: 0, batteryPercent: 50, charging: true, keepAwake: true, updatedAt: 2 }
    expect(Exit.isSuccess(Schema.decodeUnknownExit(ActivityState)(state))).toBe(true)
  })
})

describe("coordinator command", () => {
  test("named members still compose the socket union", () => {
    expect(Command.members.map((m) => m.fields.method.literal)).toContain("configure")
  })
})

describe("media and keep awake contract", () => {
  test("phones toggle keep awake and allow sleep only", () => {
    const power = (mode: string) => client({ type: "request", id: 1, key: "k", command: { method: "power", mode } })
    expect(Exit.isSuccess(power("always"))).toBe(true)
    expect(Exit.isSuccess(power("off"))).toBe(true)
    expect(Exit.isSuccess(power("while-running"))).toBe(false)
  })

  test("media listing and media events decode", () => {
    const item = { path: "/p/a.mp4", name: "a.mp4", mimeType: "video/mp4", kind: "video", size: 10, modifiedAt: 1, entry: 4 }
    expect(Exit.isSuccess(client({ type: "request", id: 1, command: { method: "media", session: "s" } }))).toBe(true)
    expect(Exit.isSuccess(decodeServer({ type: "event", seq: 3, event: { kind: "media", session: "s", items: [item, { ...item, entry: null }] } }))).toBe(true)
    expect(mediaUrlPath(asSessionId("s 1"), asFilePath("/p/a b.mp4"))).toBe("/media/s%201?path=%2Fp%2Fa%20b.mp4")
  })
})
