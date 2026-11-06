// Phone gateway over real wss: handshake, auth, resume, requests, idempotency and media ranges.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { configFile } from "../src/coordinator/gateway/config.ts"
import { type Gateway, makeGateway } from "../src/coordinator/gateway/gateway.ts"
import { makeHub } from "../src/coordinator/hub.ts"
import type { Transport } from "../src/coordinator/push/apns.ts"
import { makeDevices } from "../src/coordinator/push/devices.ts"
import { makePush } from "../src/coordinator/push/push.ts"
import { createSession } from "../src/coordinator/store.ts"
import { DEFAULT_ACCOUNT } from "../src/shared/accounts.ts"
import type { DesktopCatalog } from "../src/shared/catalog.ts"
import { asDirPath, asFilePath, asSessionId } from "../src/shared/ids.ts"
import { CloseCode, mediaUrlPath, type MobileServerMessage, PROTOCOL_VERSION } from "../src/shared/mobile.ts"
import type { ProviderUpdate } from "../src/coordinator/provider.ts"
import type { Launch } from "../src/coordinator/hub.ts"
import { freePort, insecureFetch, selfSigned, wsClient, type WsClient } from "./fixtures/gateway.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const TOKEN = "test-token-abcdefghijklmnopqrstuvwxyz"
const tls = selfSigned()
const work = mkdtempSync(path.join(tmpdir(), "daycare-gw-"))
const media = realpathSync(mkdtempSync(path.join(tmpdir(), "daycare-media-")))
const mp4 = path.join(media, "clip.mp4")
const session = asSessionId("s")

beforeAll(() => {
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10", "-pix_fmt", "yuv420p", "-y", mp4])
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
  rmSync(media, { recursive: true, force: true })
})

const noLaunch = () => {
  throw new Error("no providers in gateway tests")
}

// Provider that only records its update callback
const recordingLaunch = () => {
  const updates: Array<(u: ProviderUpdate) => void> = []
  const launch: Launch = (_s, update) => {
    updates.push(update)
    return { input: async () => {}, interrupt: () => {}, answer: () => true, close: async () => {} }
  }
  return { launch, update: (u: ProviderUpdate) => updates.at(-1)?.(u) }
}

interface Running {
  readonly gateway: Gateway
  readonly hub: ReturnType<typeof makeHub>
  readonly port: number
  readonly url: string
  readonly origin: string
  readonly stop: () => Promise<void>
}

const running: Array<Running> = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((r) => r.stop()))
})

const start = async (launch: Launch = noLaunch, timers = { helloMs: 300, pingMs: 50, stallMs: 2000 }): Promise<Running> => {
  const db = tempDb()
  const conn = db.open()
  createSession(conn, { ...sample("s", "claude", "idle"), cwd: asDirPath(media) })
  const hub = makeHub(conn, launch)
  const dir = asDirPath(mkdtempSync(path.join(work, "mobile-")))
  const port = freePort()
  writeFileSync(configFile(dir), JSON.stringify({ port, token: TOKEN }))
  const transport: Transport = async () => ({ status: 200, reason: null })
  const gateway = makeGateway({
    hub,
    db: conn,
    dir,
    attachments: asDirPath(path.join(dir, "attachments")),
    version: "0.0.0-test",
    tailscale: { self: async () => ({ host: "localhost", addresses: ["127.0.0.1"] }), cert: async () => {} },
    push: makePush({ hub, devices: makeDevices(conn), transport }),
    timers,
    tls: async () => tls,
  })
  gateway.start()
  await gateway.settle()
  const r: Running = {
    gateway,
    hub,
    port,
    url: `wss://127.0.0.1:${port}/ws`,
    origin: `https://127.0.0.1:${port}`,
    stop: async () => {
      gateway.stop()
      await hub.shutdown()
      db.remove()
    },
  }
  running.push(r)
  return r
}

const hello = (extra: object = {}) => ({ type: "hello", protocol: PROTOCOL_VERSION, app: "test", token: TOKEN, device: "phone-1", ...extra })

const open = async (r: Running) => {
  const c = wsClient(r.url)
  await c.opened
  return c
}

// Welcome plus what follows it
const greet = async (r: Running, extra: object = {}) => {
  const c = await open(r)
  c.send(hello(extra))
  const welcome = await c.next()
  return { c, welcome }
}

let nextId = 1
const request = async (c: WsClient, command: object, key?: string) => {
  const id = nextId++
  c.send({ type: "request", id, command, ...(key ? { key } : {}) })
  for (;;) {
    const msg = await c.next()
    if (msg.type === "response" && msg.id === id) {
      return msg
    }
  }
}

const catalog: DesktopCatalog = {
  locations: [{ label: "Media", path: asDirPath(media) }],
  accounts: [{ id: DEFAULT_ACCOUNT, label: "Default", configDir: null }],
  activeAccount: DEFAULT_ACCOUNT,
  defaultLocation: asDirPath(media),
  provider: "claude",
  model: "opus",
  effort: "",
  permissionMode: "default",
  models: [{ id: "opus", label: "Opus" }],
  efforts: [{ id: "", label: "Default effort" }],
  iconPack: "pokemon",
  randomNames: false,
}

describe("handshake", () => {
  test("a good hello gets welcome then a slim snapshot", async () => {
    const r = await start()
    const { c, welcome } = await greet(r)
    expect(welcome).toMatchObject({ type: "welcome", protocol: PROTOCOL_VERSION, coordinator: "0.0.0-test", epoch: r.hub.epoch, resumed: false })
    const snap = await c.next()
    expect(snap.type).toBe("snapshot")
    if (snap.type === "snapshot") {
      expect(snap.sessions.map((s) => s.id)).toEqual([session])
      expect(snap.sessions[0]).toMatchObject({ lastEntry: null, preview: null })
      expect(snap.catalog).toBeNull()
      expect("history" in snap).toBe(false)
    }
  })

  test("a wrong token is refused with 4401", async () => {
    const r = await start()
    const c = await open(r)
    c.send(hello({ token: "nope" }))
    expect(await c.next()).toEqual({ type: "error", error: { code: "unauthorized", message: "wrong pairing token" } })
    expect(await c.closed).toBe(CloseCode.unauthorized)
  })

  test("a token in the URL alone is not enough", async () => {
    const r = await start()
    const c = wsClient(`${r.url}?token=${TOKEN}`)
    await c.opened
    c.send({ type: "request", id: 1, command: { method: "media", session } })
    expect(await c.closed).toBe(CloseCode.badHello)
  })

  test("another protocol version gets protocol_mismatch and 4426", async () => {
    const r = await start()
    const c = await open(r)
    c.send(hello({ protocol: PROTOCOL_VERSION + 1 }))
    expect(await c.next()).toEqual({ type: "protocol_mismatch", server: PROTOCOL_VERSION, client: PROTOCOL_VERSION + 1 })
    expect(await c.closed).toBe(CloseCode.protocolMismatch)
  })

  test("silence past the hello timeout closes with 4400", async () => {
    const r = await start()
    const c = await open(r)
    expect(await c.closed).toBe(CloseCode.badHello)
  })

  test("a second connection from the same device replaces the first", async () => {
    const r = await start()
    const first = await greet(r)
    await first.c.next()
    const second = await greet(r)
    expect(second.welcome.type).toBe("welcome")
    expect(await first.c.closed).toBe(CloseCode.replaced)
  })

  test("rotating the pairing code closes phones and refuses the old token", async () => {
    const r = await start()
    const { c } = await greet(r)
    const info = r.gateway.rotate()
    expect(info.token).not.toBe(TOKEN)
    expect(info.url).toBe(`daycare://pair?v=1&host=localhost&port=${r.port}&token=${info.token}`)
    expect(await c.closed).toBe(CloseCode.unauthorized)
    const again = await open(r)
    again.send(hello())
    expect((await again.next()).type).toBe("error")
  })
})

describe("resume", () => {
  test("same epoch replays only events after the saved seq", async () => {
    const r = await start()
    const { c } = await greet(r)
    const snap = await c.next()
    const seq = snap.type === "snapshot" ? snap.seq : -1
    c.close()
    await c.closed
    r.hub.command({ method: "rename", session, name: "Renamed" })
    const back = await greet(r, { device: "phone-1", resume: { epoch: r.hub.epoch, seq } })
    expect(back.welcome).toMatchObject({ type: "welcome", resumed: true })
    const replayed = await back.c.next()
    expect(replayed).toMatchObject({ type: "event", event: { kind: "session", session: { id: session, name: "Renamed" } } })
    expect(replayed.type === "event" && replayed.seq > seq).toBe(true)
  })

  test("another epoch or a seq from the future gets a fresh snapshot", async () => {
    const r = await start()
    const stale = await greet(r, { resume: { epoch: "old", seq: 0 } })
    expect(stale.welcome).toMatchObject({ resumed: false })
    expect((await stale.c.next()).type).toBe("snapshot")
    const future = await greet(r, { device: "phone-2", resume: { epoch: r.hub.epoch, seq: 10_000 } })
    expect(future.welcome).toMatchObject({ resumed: false })
  })

  test("chat events reach watched sessions only, without deltas when asked", async () => {
    const fake = recordingLaunch()
    const r = await start(fake.launch)
    const { c } = await greet(r)
    await c.next()
    const kinds = async () => {
      const seen: Array<string> = []
      while (c.queued()) {
        const m = await c.next()
        seen.push(m.type === "event" ? (m.event.kind === "chat" ? `chat:${m.event.event.kind}` : m.event.kind) : m.type)
      }
      return seen
    }
    const sent = await request(c, { method: "send", session, text: "hi", files: [] })
    expect(sent).toMatchObject({ result: { accepted: "coordinator", entry: 1 } })
    expect(await kinds()).not.toContain("chat:user")
    expect(await request(c, { method: "watch", sessions: [session], deltas: false })).toMatchObject({ result: {}, replayed: false })
    fake.update({ type: "event", event: { kind: "text-delta", block: "b", text: "x" } })
    fake.update({ type: "event", event: { kind: "text", block: "b", text: "xy" } })
    await Bun.sleep(50)
    expect(await kinds()).toEqual(["chat:text"])
  })

  test("events a command causes arrive before its response", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    c.send({ type: "request", id: 999, command: { method: "rename", session, name: "Ordered" } })
    expect(await c.next()).toMatchObject({ type: "event", event: { kind: "session", session: { name: "Ordered" } } })
    expect(await c.next()).toMatchObject({ type: "response", id: 999 })
  })
})

describe("requests", () => {
  test("a repeated key replays the stored result without running again", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    const first = await request(c, { method: "rename", session, name: "Keyed" }, "key-1")
    expect(first).toEqual({ type: "response", id: expect.any(Number), result: {}, replayed: false })
    r.hub.command({ method: "rename", session, name: "Changed later" })
    const again = await request(c, { method: "rename", session, name: "Keyed" }, "key-1")
    expect(again).toMatchObject({ result: {}, replayed: true })
    expect(r.hub.state().sessions[0]?.name).toBe("Changed later")
    const misuse = await request(c, { method: "interrupt", session }, "key-1")
    expect(misuse).toMatchObject({ error: { code: "bad_request" } })
  })

  test("hub refusals are rejected and stay refused on retry", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    expect(await request(c, { method: "interrupt", session }, "k2")).toMatchObject({ error: { code: "rejected", message: "session is not running" } })
    expect(await request(c, { method: "interrupt", session }, "k2")).toMatchObject({ error: { code: "rejected" } })
  })

  test("history pages and refuses both cursors", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    expect(await request(c, { method: "history", session })).toMatchObject({ result: { session, rows: [], hasOlder: false, hasNewer: false } })
    expect(await request(c, { method: "history", session, before: 3, after: 1 })).toMatchObject({ error: { code: "bad_request" } })
    expect(await request(c, { method: "history", session: "nope" })).toMatchObject({ error: { code: "rejected" } })
  })

  test("create needs the desktop catalog and a known folder", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    const create = { method: "create", provider: "claude", cwd: media, prompt: "", model: null, effort: null, permissionMode: "default", files: [] }
    expect(await request(c, create)).toMatchObject({ error: { code: "rejected" } })
    r.hub.command({ method: "catalog", catalog })
    expect(await c.next()).toMatchObject({ type: "event", event: { kind: "catalog", catalog: { accounts: [{ id: DEFAULT_ACCOUNT, label: "Default" }] } } })
    expect(await request(c, { ...create, cwd: "/etc" })).toMatchObject({ error: { code: "rejected" } })
    const made = await request(c, create, "create-1")
    expect(made).toMatchObject({ result: { session: expect.any(String) } })
    const created = r.hub.state().sessions.find((s) => s.id !== session)
    expect(created).toMatchObject({ cwd: media, name: "Media", accountId: DEFAULT_ACCOUNT, configDir: null, role: "master" })
    expect(created?.icon).toBeTruthy()
  })

  test("uploads land under attachments and are size checked", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    const res = await request(c, { method: "upload", name: "../note.txt", data: Buffer.from("hi").toString("base64") })
    const saved = res.type === "response" && "result" in res ? String((res.result as { path: string }).path) : ""
    expect(path.basename(saved)).toBe("note.txt")
    expect(readFileSync(saved, "utf8")).toBe("hi")
    const big = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64")
    expect(await request(c, { method: "upload", name: "big.bin", data: big })).toMatchObject({ error: { code: "too_large" } })
  })

  test("register stores the device for pushes", async () => {
    const r = await start()
    const { c } = await greet(r)
    await c.next()
    const reg = { method: "register", apnsToken: "ab12", environment: "development", pushToStart: null, kinds: ["approval"] }
    expect(await request(c, reg, "reg-1")).toMatchObject({ result: {} })
    expect(await request(c, { method: "media", session })).toMatchObject({ result: { session, items: [] } })
  })
})

describe("media endpoint", () => {
  const size = () => statSync(mp4).size
  const get = (r: Running, file: string, headers: Record<string, string> = {}, method = "GET") =>
    insecureFetch(`${r.origin}${mediaUrlPath(session, asFilePath(file))}`, { method, headers: { authorization: `Bearer ${TOKEN}`, ...headers } })

  test("needs the bearer token", async () => {
    const r = await start()
    const res = await insecureFetch(`${r.origin}${mediaUrlPath(session, asFilePath(mp4))}`)
    expect(res.status).toBe(401)
    expect((await get(r, mp4, { authorization: "Bearer wrong" })).status).toBe(401)
  })

  test("serves a real mp4 whole with its sniffed type", async () => {
    const r = await start()
    const res = await get(r, mp4)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("video/mp4")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(Number(res.headers.get("content-length"))).toBe(size())
    expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(mp4))).toBe(true)
  })

  test("answers AVPlayer style ranges with 206", async () => {
    const r = await start()
    const probe = await get(r, mp4, { range: "bytes=0-1" })
    expect(probe.status).toBe(206)
    expect(probe.headers.get("content-range")).toBe(`bytes 0-1/${size()}`)
    expect(Buffer.from(await probe.arrayBuffer()).equals(readFileSync(mp4).subarray(0, 2))).toBe(true)
    const middle = await get(r, mp4, { range: "bytes=100-" })
    expect(middle.status).toBe(206)
    expect(Number(middle.headers.get("content-length"))).toBe(size() - 100)
    expect(Buffer.from(await middle.arrayBuffer()).equals(readFileSync(mp4).subarray(100))).toBe(true)
    const tail = await get(r, mp4, { range: "bytes=-16" })
    expect(tail.headers.get("content-range")).toBe(`bytes ${size() - 16}-${size() - 1}/${size()}`)
    expect(Buffer.from(await tail.arrayBuffer()).equals(readFileSync(mp4).subarray(size() - 16))).toBe(true)
  })

  test("unsatisfiable ranges get 416 and HEAD has no body", async () => {
    const r = await start()
    const bad = await get(r, mp4, { range: `bytes=${size()}-` })
    expect(bad.status).toBe(416)
    expect(bad.headers.get("content-range")).toBe(`bytes */${size()}`)
    const head = await get(r, mp4, {}, "HEAD")
    expect(head.status).toBe(200)
    expect(Number(head.headers.get("content-length"))).toBe(size())
  })

  test("files the session cannot reach are 404", async () => {
    const r = await start()
    const outside = path.join(work, "outside.mp4")
    writeFileSync(outside, readFileSync(mp4))
    expect((await get(r, outside)).status).toBe(404)
    expect((await get(r, path.join(media, "missing.mp4"))).status).toBe(404)
    const notMedia = path.join(media, "notes.mp4")
    mkdirSync(path.dirname(notMedia), { recursive: true })
    writeFileSync(notMedia, "plain text")
    expect((await get(r, notMedia)).status).toBe(404)
  })
})

describe("pairing info", () => {
  test("reports host, port, cert expiry and missing APNs fields", async () => {
    const r = await start()
    const info = r.gateway.pairing()
    expect(info).toMatchObject({
      listening: true,
      host: "localhost",
      port: r.port,
      token: TOKEN,
      url: `daycare://pair?v=1&host=localhost&port=${r.port}&token=${TOKEN}`,
      certExpiresAt: tls.expiresAt,
      apnsMissing: ["keyFile", "keyId", "teamId", "bundleId"],
      error: null,
    })
  })

  test("Tailscale being down is reported, not thrown", async () => {
    const db = tempDb()
    const conn = db.open()
    const hub = makeHub(conn, noLaunch)
    const dir = asDirPath(mkdtempSync(path.join(work, "down-")))
    const gateway = makeGateway({
      hub,
      db: conn,
      dir,
      attachments: asDirPath(path.join(dir, "attachments")),
      version: "t",
      tailscale: {
        self: async () => {
          throw new Error("Tailscale is not running (Stopped)")
        },
        cert: async () => {},
      },
      push: makePush({ hub, devices: makeDevices(conn), transport: async () => ({ status: 200, reason: null }) }),
    })
    expect(gateway.pairing()).toBeNull()
    const info = gateway.setup()
    await gateway.settle()
    expect(gateway.pairing()).toMatchObject({ listening: false, host: null, url: null, port: 7443, token: info.token, error: "Tailscale is not running (Stopped)" })
    expect(JSON.parse(readFileSync(configFile(dir), "utf8"))).toEqual({ port: 7443, token: info.token })
    expect(statSync(configFile(dir)).mode & 0o777).toBe(0o600)
    gateway.stop()
    await hub.shutdown()
    db.remove()
  })
})
