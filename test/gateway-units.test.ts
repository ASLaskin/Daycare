// Gateway pieces without sockets: replay, idempotency, auth, Tailscale parsing.

import { describe, expect, test } from "bun:test"
import { makeAuth, bearer, FAILURE_LIMIT, PENALTY_MS } from "../src/coordinator/gateway/auth.ts"
import { KEEP_MS, makeIdempotency } from "../src/coordinator/gateway/idempotency.ts"
import { fail, ok, type Outcome } from "../src/coordinator/gateway/outcome.ts"
import { makeReplay } from "../src/coordinator/gateway/replay.ts"
import { certError, parseStatus } from "../src/coordinator/gateway/tailscale.ts"
import { asSessionId } from "../src/shared/ids.ts"
import { asDeviceId, asPairingToken, asRequestKey, type MobileEvent } from "../src/shared/mobile.ts"
import { tempDb } from "./fixtures/store.ts"

const removed = (n: number): MobileEvent => ({ kind: "removed", session: asSessionId(`s${n}`), parentId: null })

describe("replay buffer", () => {
  test("resumes from any seq still covered, refusing evicted or future ones", () => {
    const replay = makeReplay(10, { events: 3, bytes: 1_000_000 })
    ;[11, 12, 13, 14].forEach((seq) => replay.push(seq, removed(seq)))
    expect(replay.size()).toBe(3)
    expect(replay.since(10)).toBeNull()
    expect(replay.since(11)?.map((i) => i.seq)).toEqual([12, 13, 14])
    expect(replay.since(13)?.map((i) => i.seq)).toEqual([14])
    expect(replay.since(14)).toEqual([])
    expect(replay.since(15)).toBeNull()
  })

  test("a seq the gateway saw without phone events still resumes", () => {
    const replay = makeReplay(0)
    replay.advance(5)
    expect(replay.since(5)).toEqual([])
  })

  test("events from before the gateway started cannot be replayed", () => {
    const replay = makeReplay(7)
    expect(replay.since(3)).toBeNull()
    expect(replay.since(7)).toEqual([])
  })

  test("the byte bound evicts oldest first", () => {
    const one = JSON.stringify(removed(1)).length
    const replay = makeReplay(0, { events: 100, bytes: one * 2 })
    ;[1, 2, 3].forEach((seq) => replay.push(seq, removed(seq)))
    expect(replay.since(1)?.map((i) => i.seq)).toEqual([2, 3])
    expect(replay.since(0)).toBeNull()
  })
})

describe("idempotency", () => {
  const device = asDeviceId("d")
  const key = asRequestKey("k")

  const setup = () => {
    const db = tempDb()
    let now = 1_000_000
    const store = makeIdempotency(db.open(), () => now)
    return { store, advance: (ms: number) => (now += ms), remove: db.remove }
  }

  test("runs once and replays the stored result", async () => {
    const { store, remove } = setup()
    let runs = 0
    const work = async (): Promise<Outcome> => ok({ n: ++runs })
    expect(await store.run(device, key, "send", work)).toEqual({ outcome: { result: { n: 1 } }, replayed: false })
    expect(await store.run(device, key, "send", work)).toEqual({ outcome: { result: { n: 1 } }, replayed: true })
    expect(runs).toBe(1)
    remove()
  })

  test("a repeat while the first runs waits for it", async () => {
    const { store, remove } = setup()
    let release: () => void = () => {}
    let runs = 0
    const work = () =>
      new Promise<Outcome>((resolve) => {
        runs += 1
        release = () => resolve(ok({}))
      })
    const first = store.run(device, key, "send", work)
    const second = store.run(device, key, "send", work)
    release()
    expect((await first).replayed).toBe(false)
    expect((await second).replayed).toBe(true)
    expect(runs).toBe(1)
    remove()
  })

  test("retryable errors are not stored, refusals are", async () => {
    const { store, remove } = setup()
    let runs = 0
    const flaky = async () => {
      runs += 1
      return fail("unavailable", "stopping")
    }
    await store.run(device, key, "send", flaky)
    await store.run(device, key, "send", flaky)
    expect(runs).toBe(2)
    const refuse = async () => fail("rejected", "no")
    await store.run(device, asRequestKey("r"), "send", refuse)
    expect(await store.run(device, asRequestKey("r"), "send", async () => ok({}))).toEqual({ outcome: fail("rejected", "no"), replayed: true })
    remove()
  })

  test("keys are per device, per method, and expire after 7 days", async () => {
    const { store, advance, remove } = setup()
    await store.run(device, key, "send", async () => ok(1))
    expect((await store.run(asDeviceId("other"), key, "send", async () => ok(2))).outcome).toEqual(ok(2))
    expect((await store.run(device, key, "rename", async () => ok(3))).outcome).toMatchObject({ error: { code: "bad_request" } })
    advance(KEEP_MS + 1)
    expect(await store.run(device, key, "send", async () => ok(4))).toEqual({ outcome: ok(4), replayed: false })
    remove()
  })
})

describe("auth", () => {
  test("constant time token check and a slowdown after repeated failures", () => {
    let now = 0
    const auth = makeAuth(() => asPairingToken("secret"), () => now)
    expect(auth.check("secret")).toBe(true)
    expect(auth.check(null)).toBe(false)
    Array.from({ length: FAILURE_LIMIT - 1 }, () => auth.check("bad"))
    expect(auth.delay()).toBe(PENALTY_MS)
    now += 61_000
    expect(auth.delay()).toBe(0)
  })

  test("bearer header parsing", () => {
    expect(bearer("Bearer abc")).toBe("abc")
    expect(bearer("bearer abc ")).toBe("abc")
    expect(bearer("Basic abc")).toBeNull()
    expect(bearer(null)).toBeNull()
  })
})

describe("tailscale status", () => {
  const status = (o: object) => JSON.stringify({ BackendState: "Running", Self: { DNSName: "mac.tail1.ts.net.", TailscaleIPs: ["100.1.2.3", "fd7a::1"] }, ...o })

  test("reads the MagicDNS name without its dot and every address", () => {
    expect(parseStatus(status({}))).toEqual({ host: "mac.tail1.ts.net", addresses: ["100.1.2.3", "fd7a::1"] })
  })

  test("explains a stopped backend, missing MagicDNS and HTTPS off", () => {
    expect(() => parseStatus(status({ BackendState: "Stopped" }))).toThrow("Tailscale is not running (Stopped)")
    expect(() => parseStatus(status({ Self: { DNSName: "", TailscaleIPs: ["100.1.2.3"] } }))).toThrow("MagicDNS is off")
    expect(certError("your Tailscale account does not support getting TLS certs; HTTPS is not enabled")).toContain("HTTPS certificates are off")
    expect(certError("open /x: permission denied")).toContain("tailscale cert failed")
  })
})
