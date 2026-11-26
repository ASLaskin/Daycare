// APNs JWT, headers, payloads and delivery with a fake HTTP/2 transport.

import { describe, expect, test } from "bun:test"
import { generateKeyPairSync, verify } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { makeHub } from "../src/coordinator/hub.ts"
import type { ProviderUpdate } from "../src/coordinator/provider.ts"
import { activityState, COALESCE_MS, IDLE_END_MS, makeActivityPusher, type ActivityEvent } from "../src/coordinator/push/activity.ts"
import { BATTERY_THRESHOLDS, makeAlerts } from "../src/coordinator/push/alerts.ts"
import { apnsHeaders, JWT_REFRESH_MS, makeApns, makeJwt, type Transport } from "../src/coordinator/push/apns.ts"
import { apnsSettings, type ApnsSettings } from "../src/coordinator/push/apnsConfig.ts"
import { makeDevices } from "../src/coordinator/push/devices.ts"
import { activityPayload, makePush } from "../src/coordinator/push/push.ts"
import { createSession } from "../src/coordinator/store.ts"
import type { LiveSession } from "../src/shared/coordinator.ts"
import { asDirPath, asRequestId, asSessionId } from "../src/shared/ids.ts"
import { asActivityId, asApnsToken, asDeviceId, type ActivityState } from "../src/shared/mobile.ts"
import type { PowerState } from "../src/shared/power.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const settings: ApnsSettings = { key: pair.privateKey, keyId: "KEY1234567", teamId: "TEAM123456", bundleId: "com.example.daycare", environment: "development" }

interface Sent {
  readonly origin: string
  readonly path: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

const fakeTransport = (answer: (n: number, s: Sent) => { status: number; reason: string | null } = () => ({ status: 200, reason: null })) => {
  const sent: Array<Sent> = []
  const transport: Transport = async (origin, p, headers, body) => {
    const s = { origin, path: p, headers, body: JSON.parse(body) }
    sent.push(s)
    return answer(sent.length, s)
  }
  return { sent, transport }
}

const decodePart = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"))

describe("JWT", () => {
  test("is ES256 with kid, iss and iat, verifiable with the public key", () => {
    const jwt = makeJwt(settings, 1_700_000_000_500)
    const [header, claims, signature] = jwt.split(".")
    expect(decodePart(header!)).toEqual({ alg: "ES256", kid: "KEY1234567" })
    expect(decodePart(claims!)).toEqual({ iss: "TEAM123456", iat: 1_700_000_000 })
    const raw = Buffer.from(signature!, "base64url")
    expect(raw.length).toBe(64)
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true)
  })

  test("is cached for 50 minutes, then refreshed", async () => {
    let now = 0
    const { sent, transport } = fakeTransport()
    const apns = makeApns(settings, transport, () => now)
    const req = { token: asApnsToken("aa"), environment: "development" as const, type: "alert" as const, payload: {}, priority: 10 as const }
    await apns.send(req)
    now += 60_000
    await apns.send(req)
    now += JWT_REFRESH_MS
    await apns.send(req)
    const auth = sent.map((s) => s.headers["authorization"])
    expect(auth[0]).toBe(auth[1])
    expect(auth[2]).not.toBe(auth[1])
  })

  test("an expired provider token is retried once with a fresh JWT", async () => {
    let now = 0
    const { sent, transport } = fakeTransport((n) => (n === 1 ? { status: 403, reason: "ExpiredProviderToken" } : { status: 200, reason: null }))
    const apns = makeApns(settings, transport, () => (now += 1000))
    const r = await apns.send({ token: asApnsToken("aa"), environment: "development", type: "alert", payload: {}, priority: 10 })
    expect(r.status).toBe(200)
    expect(sent.length).toBe(2)
    expect(sent[0]!.headers["authorization"]).not.toBe(sent[1]!.headers["authorization"])
  })
})

describe("requests", () => {
  test("alert and Live Activity headers, hosts and topics", async () => {
    const { sent, transport } = fakeTransport()
    const apns = makeApns(settings, transport)
    await apns.send({ token: asApnsToken("ab"), environment: "development", type: "alert", payload: {}, priority: 10, collapseId: "req-1" })
    await apns.send({ token: asApnsToken("cd"), environment: "production", type: "liveactivity", payload: {}, priority: 5 })
    expect(sent[0]).toMatchObject({
      origin: "https://api.sandbox.push.apple.com",
      path: "/3/device/ab",
      headers: { "apns-topic": "com.example.daycare", "apns-push-type": "alert", "apns-priority": "10", "apns-collapse-id": "req-1" },
    })
    expect(sent[1]).toMatchObject({
      origin: "https://api.push.apple.com",
      headers: { "apns-topic": "com.example.daycare.push-type.liveactivity", "apns-push-type": "liveactivity", "apns-priority": "5" },
    })
    expect("apns-collapse-id" in apnsHeaders(settings, "j", { token: asApnsToken("x"), environment: "development", type: "alert", payload: {}, priority: 10 })).toBe(false)
  })
})

describe("config", () => {
  test("lists missing fields and refuses an unreadable key", () => {
    const dir = asDirPath(mkdtempSync(path.join(tmpdir(), "daycare-apns-")))
    expect(apnsSettings(dir, undefined).missing).toEqual(["keyFile", "keyId", "teamId", "bundleId"])
    expect(apnsSettings(dir, { keyId: "K", teamId: "T" }).missing).toEqual(["keyFile", "bundleId"])
    const block = { keyFile: "AuthKey_K.p8", keyId: "K", teamId: "T", bundleId: "b" }
    expect(apnsSettings(dir, block).missing[0]).toContain("AuthKey_K.p8")
    writeFileSync(path.join(dir, "AuthKey_K.p8"), pair.privateKey.export({ format: "pem", type: "pkcs8" }))
    const loaded = apnsSettings(dir, block)
    expect(loaded.missing).toEqual([])
    expect(loaded.settings).toMatchObject({ keyId: "K", teamId: "T", bundleId: "b", environment: "development" })
    rmSync(dir, { recursive: true, force: true })
  })
})

const live = (id: string, extra: Partial<LiveSession> = {}): LiveSession => ({ ...sample(id, "claude", "idle"), live: true, ...extra })

const power = (percent: number | null, charging = false): PowerState => ({
  mode: "while-running",
  holding: true,
  busyCount: 0,
  battery: percent === null ? null : { percent, pluggedIn: charging, charging, minutesRemaining: null, readAt: 1 },
  lidClosed: null,
  error: null,
})

describe("alerts", () => {
  const sessions = new Map([
    ["m", live("m", { name: "Ada" })],
    ["w", live("w", { name: "Bolt", role: "worker", parentId: asSessionId("m") })],
  ])
  const alerts = makeAlerts((id) => sessions.get(id))
  const turnEnd = (session: string, isError = false, text = "All tests pass.\nDone") => ({
    kind: "chat" as const,
    session: asSessionId(session),
    entry: 3,
    event: { kind: "turn-end" as const, isError, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text },
  })

  test("worker and master turn ends, threaded by master, tap only", () => {
    const [worker] = alerts(turnEnd("w"))
    expect(worker).toMatchObject({ kind: "worker-done" })
    expect(worker!.payload).toEqual({
      aps: { alert: { title: "Bolt finished", body: "All tests pass. Done" }, sound: "default", "thread-id": "m" },
      daycare: { kind: "worker-done", session: "w", request: null },
    })
    expect(alerts(turnEnd("m", true, ""))[0]).toMatchObject({ kind: "master-done", payload: { aps: { alert: { title: "Ada failed", body: "failed" } } } })
  })

  test("approvals carry the request and collapse by it", () => {
    const event = {
      kind: "permission" as const,
      requestId: asRequestId("r1"),
      toolUseId: null,
      name: "Bash",
      title: "Run ls",
      input: {},
      description: "",
      suggestions: [],
      requiresUserInteraction: false,
    }
    const [a] = alerts({ kind: "approval", approval: { session: asSessionId("w"), request: asRequestId("r1"), choices: ["accept", "decline"], event } })
    expect(a).toMatchObject({ kind: "approval", collapseId: "r1" })
    expect(a!.payload).toEqual({
      aps: { alert: { title: "Bolt needs you", body: "Run ls" }, sound: "default", "thread-id": "m" },
      daycare: { kind: "approval", session: "w", request: "r1" },
    })
  })

  test("low battery fires once per threshold while discharging and rearms after charging", () => {
    const battery = (p: number, charging = false) => alerts({ kind: "power", power: power(p, charging) })
    expect(battery(50)).toEqual([])
    expect(battery(20)).toHaveLength(1)
    expect(battery(19)).toEqual([])
    expect(battery(10)[0]).toMatchObject({ kind: "battery-low", payload: { aps: { alert: { title: "Mac battery at 10%" } } } })
    expect(battery(5)).toEqual([])
    expect(battery(5, true)).toEqual([])
    expect(battery(15)).toHaveLength(1)
    expect(BATTERY_THRESHOLDS).toEqual([20, 10])
  })
})

describe("Live Activity", () => {
  const running = (id: string, name: string, extra: Partial<LiveSession> = {}) => live(id, { name, state: "running", ...extra })

  test("state lists running sessions newest first, at most 4, with master names", () => {
    const sessions = [
      running("m", "Ada"),
      running("w1", "One", { role: "worker", parentId: asSessionId("m") }),
      running("w2", "Two"),
      running("w3", "Three"),
      running("w4", "Four"),
      live("idle", { name: "Idle" }),
      running("closed", "Closed", { closed: true }),
    ]
    const since = new Map(sessions.map((s, i) => [s.id, 100 + i]))
    const state = activityState({ sessions, approvals: 2, power: power(80, true), since }, 200_000)
    expect(state.runningCount).toBe(5)
    expect(state.running.map((w) => w.name)).toEqual(["Four", "Three", "Two", "One"])
    expect(state.running[3]).toEqual({ id: asSessionId("w1"), name: "One", master: "Ada", since: 101 })
    expect(state).toMatchObject({ approvals: 2, batteryPercent: 80, charging: true, keepAwake: true, updatedAt: 200 })
  })

  test("payloads for start, update and end", () => {
    const state = activityState({ sessions: [running("m", "Ada")], approvals: 0, power: power(null), since: new Map() }, 5000)
    expect(activityPayload("update", state, 9000, null)).toEqual({ aps: { timestamp: 9, event: "update", "content-state": state } })
    expect(activityPayload("end", state, 9000, null)).toEqual({ aps: { timestamp: 9, event: "end", "content-state": state, "dismissal-date": 9 } })
    expect(activityPayload("start", state, 9000, { host: "mac.ts.net" })).toMatchObject({
      aps: { event: "start", "attributes-type": "DaycareActivityAttributes", attributes: { host: "mac.ts.net" }, alert: { title: "Agents running" } },
    })
  })

  test("updates coalesce to one per 15 s, approvals go at once, idle ends after 10 minutes", () => {
    let now = 0
    const timers: Array<{ at: number; f: () => void; live: boolean }> = []
    const clock = {
      now: () => now,
      setTimeout: (f: () => void, ms: number) => {
        const t = { at: now + ms, f, live: true }
        timers.push(t)
        return t as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: (t: ReturnType<typeof setTimeout>) => {
        ;(t as unknown as { live: boolean }).live = false
      },
    }
    const advance = (ms: number) => {
      now += ms
      timers.filter((t) => t.live && t.at <= now).forEach((t) => {
        t.live = false
        t.f()
      })
    }
    const out: Array<[ActivityEvent, number, 5 | 10]> = []
    const pusher = makeActivityPusher((event, state, priority) => out.push([event, state.runningCount, priority]), clock)
    const state = (runningCount: number, approvals = 0, percent = 50): ActivityState => ({
      running: [],
      runningCount,
      approvals,
      batteryPercent: percent,
      charging: false,
      keepAwake: false,
      updatedAt: now / 1000,
    })
    pusher.update(state(0))
    expect(out).toEqual([])
    pusher.update(state(1))
    expect(out).toEqual([["start", 1, 10]])
    pusher.update(state(2))
    pusher.update(state(3))
    expect(out).toHaveLength(1)
    advance(COALESCE_MS)
    expect(out.at(-1)).toEqual(["update", 3, 5])
    pusher.update(state(3, 1))
    expect(out.at(-1)).toEqual(["update", 3, 10])
    pusher.update(state(0, 0))
    expect(out.at(-1)).toEqual(["update", 0, 10])
    pusher.update(state(0, 0, 49))
    advance(COALESCE_MS)
    expect(out.at(-1)).toEqual(["update", 0, 5])
    advance(IDLE_END_MS)
    expect(out.at(-1)?.[0]).toBe("end")
  })
})

describe("push delivery", () => {
  test("alerts go to devices that asked, dead tokens are dropped, nothing without settings", async () => {
    const db = tempDb()
    const conn = db.open()
    createSession(conn, sample("s", "claude", "idle"))
    let update: (u: ProviderUpdate) => void = () => {}
    const hub = makeHub(conn, (_s, u) => {
      update = u
      return { input: async () => {}, interrupt: () => {}, answer: () => true, close: async () => {} }
    })
    const devices = makeDevices(conn)
    devices.register({ device: asDeviceId("a"), apnsToken: asApnsToken("aaaa"), environment: "development", pushToStart: null, kinds: ["master-done"] })
    devices.register({ device: asDeviceId("b"), apnsToken: asApnsToken("bbbb"), environment: "production", pushToStart: asApnsToken("start"), kinds: ["approval"] })
    devices.setActivity(asDeviceId("b"), asActivityId("act"), asApnsToken("acttoken"))
    const { sent, transport } = fakeTransport((_, s) => (s.path.endsWith("aaaa") ? { status: 410, reason: "Unregistered" } : { status: 200, reason: null }))
    const push = makePush({ hub, devices, transport })
    const turnEnd = { kind: "turn-end" as const, isError: false, stopReason: null, costUsd: 0, contextTokens: 0, numTurns: null, durationMs: null, text: "ok" }

    hub.send(asSessionId("s"), { text: "go", images: [], files: [] })
    update({ type: "event", event: turnEnd })
    await Bun.sleep(10)
    expect(sent).toEqual([])

    push.configure(settings)
    expect(push.enabled()).toBe(true)
    hub.send(asSessionId("s"), { text: "again", images: [], files: [] })
    update({ type: "event", event: turnEnd })
    await Bun.sleep(10)
    const alerts = sent.filter((s) => s.headers["apns-push-type"] === "alert")
    expect(alerts.map((s) => s.path)).toEqual(["/3/device/aaaa"])
    expect(alerts[0]!.body).toMatchObject({ daycare: { kind: "master-done", session: "s" } })
    const activities = sent.filter((s) => s.headers["apns-push-type"] === "liveactivity")
    expect(activities.length).toBeGreaterThan(0)
    expect(activities.every((s) => s.path === "/3/device/acttoken" && s.origin === "https://api.push.apple.com")).toBe(true)
    expect(devices.list().map((d) => d.device)).toEqual([asDeviceId("b")])

    push.configure(null)
    expect(push.enabled()).toBe(false)
    push.stop()
    await hub.shutdown()
    db.remove()
  })
})
