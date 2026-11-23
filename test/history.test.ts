// Retained history: byte accounting, eviction, oversized entries and partials.

import type { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { ENTRY_LIMIT, LIMIT, loadHistory, loadRows, page, record, summary, utf8Prefix } from "../src/coordinator/history.ts"
import { createSession } from "../src/coordinator/store.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import { asSessionId, asToolUseId } from "../src/shared/ids.ts"
import { asBase64 } from "../src/shared/images.ts"
import { sample, tempDb } from "./fixtures/store.ts"

const id = asSessionId("s")
const dbs: Array<ReturnType<typeof tempDb>> = []
afterEach(() => dbs.splice(0).forEach((db) => db.remove()))

const setup = () => {
  const db = tempDb()
  dbs.push(db)
  const conn = db.open()
  createSession(conn, sample("s", "claude", "running"))
  return { db, conn }
}

// Counter matches the stored UTF-8 bytes and stays within the limit
const accounted = (conn: Database) => {
  const row = conn
    .query<{ counter: number; stored: number }, []>(
      `SELECT history_bytes AS counter,
        (SELECT COALESCE(SUM(length(CAST(body AS BLOB))), 0) FROM history WHERE session_id = 's') AS stored
       FROM sessions WHERE id = 's'`,
    )
    .get()
  expect(row?.counter).toBe(row?.stored ?? -1)
  expect(row?.counter ?? Infinity).toBeLessThanOrEqual(LIMIT)
  return row?.counter
}

const events = (conn: Database) => {
  const h = loadHistory(conn, id)
  if ("error" in h) {
    throw new Error(h.error)
  }
  return h
}

const text = (block: string, t: string): ChatEvent => ({ kind: "text", block, text: t })
const delta = (block: string, t: string): ChatEvent => ({ kind: "text-delta", block, text: t })

test("evicts oldest whole entries across the limit", () => {
  const { conn } = setup()
  const chunk = "é".repeat(450 * 1024)
  Array.from({ length: 10 }, (_, n) => record(conn, id, 1, text(`b${n}`, chunk)))
  accounted(conn)
  const h = events(conn)
  expect(h.evicted).toBe(true)
  const blocks = h.events.map((e) => (e.kind === "text" ? Number(e.block.slice(1)) : -1))
  expect(blocks.length).toBeLessThan(10)
  expect(blocks).toEqual(Array.from({ length: blocks.length }, (_, i) => 10 - blocks.length + i))
})

test("an oversized entry becomes a decodable oversized event", () => {
  const { conn } = setup()
  const original: ChatEvent = { kind: "tool-end", toolUseId: asToolUseId("t"), isError: false, content: "🦀".repeat(512 * 1024), structured: null }
  record(conn, id, 1, original)
  accounted(conn)
  const [entry] = events(conn).events
  expect(entry?.kind).toBe("oversized")
  if (entry?.kind !== "oversized") {
    return
  }
  expect(entry.original).toBe("tool-end")
  expect(entry.bytes).toBe(Buffer.byteLength(JSON.stringify(original)))
  expect(Buffer.byteLength(JSON.stringify(entry))).toBeLessThanOrEqual(ENTRY_LIMIT)
  expect(entry.preview.endsWith("🦀")).toBe(true)
})

test("partial output survives reopening until its text completes", () => {
  const { db, conn } = setup()
  record(conn, id, 1, { kind: "user", text: "hi", images: [], omittedImages: 0, files: [] })
  record(conn, id, 1, delta("m1:0", "Hel"))
  record(conn, id, 1, delta("m1:0", "lo"))
  conn.close()

  const reopened = db.open()
  expect(events(reopened).events.map((e) => e.kind)).toEqual(["user", "text-delta", "text-delta"])
  record(reopened, id, 1, text("m1:0", "Hello"))
  accounted(reopened)
  expect(events(reopened).events).toEqual([{ kind: "user", text: "hi", images: [], omittedImages: 0, files: [] }, text("m1:0", "Hello")])
})

test("utf8Prefix cuts on a character boundary", () => {
  expect(utf8Prefix("a🦀b", 3)).toBe("a")
  expect(utf8Prefix("a🦀b", 5)).toBe("a🦀")
  expect(utf8Prefix("ab", 10)).toBe("ab")
})

test("entries are never reused once streamed partials are replaced", () => {
  const { conn } = setup()
  expect(record(conn, id, 1, { kind: "user", text: "hi", images: [], omittedImages: 0, files: [] })).toBe(1)
  expect(record(conn, id, 1, delta("m1:0", "Hel"))).toBe(2)
  expect(record(conn, id, 1, delta("m1:0", "lo"))).toBe(3)
  expect(record(conn, id, 1, text("m1:0", "Hello"))).toBe(4)
  expect(loadRows(conn, id).map((r) => r.entry)).toEqual([1, 4])
})

test("an oversized user message keeps its text and counts its images as omitted", () => {
  const { conn } = setup()
  const image = { mediaType: "image/png" as const, data: asBase64("A".repeat(ENTRY_LIMIT)) }
  record(conn, id, 1, { kind: "user", text: "look", images: [image], omittedImages: 0, files: [] })
  expect(events(conn).events).toEqual([{ kind: "user", text: "look", images: [], omittedImages: 1, files: [] }])
})

describe("pages", () => {
  const fill = (conn: Database, n: number) => Array.from({ length: n }, (_, i) => record(conn, id, 1, text(`b${i}`, `t${i}`)))
  const entries = (p: ReturnType<typeof page>) => p?.rows.map((r) => r.entry)

  test("without a cursor the newest rows come oldest first", () => {
    const { conn } = setup()
    fill(conn, 5)
    const p = page(conn, id, null, 2)
    expect(entries(p)).toEqual([4, 5])
    expect([p?.hasOlder, p?.hasNewer, p?.evicted]).toEqual([true, false, false])
  })

  test("before and after are exclusive and say what lies beyond", () => {
    const { conn } = setup()
    fill(conn, 5)
    const older = page(conn, id, { before: 4 }, 2)
    expect(entries(older)).toEqual([2, 3])
    expect([older?.hasOlder, older?.hasNewer]).toEqual([true, true])
    const newer = page(conn, id, { after: 3 }, 10)
    expect(entries(newer)).toEqual([4, 5])
    expect([newer?.hasOlder, newer?.hasNewer]).toEqual([true, false])
    const caughtUp = page(conn, id, { after: 5 }, 10)
    expect(entries(caughtUp)).toEqual([])
    expect([caughtUp?.hasOlder, caughtUp?.hasNewer]).toEqual([true, false])
  })

  test("a page stops at its byte budget but always carries one row", () => {
    const { conn } = setup()
    fill(conn, 3)
    expect(entries(page(conn, id, null, 10, 1))).toEqual([3])
    expect(page(conn, asSessionId("missing"), null, 10)).toBeNull()
  })

  test("summary reports the newest entry, its time and assistant text", () => {
    const { conn } = setup()
    expect(summary(conn, id)).toEqual({ lastEntry: null, lastEventAt: null, preview: null })
    record(conn, id, 1, text("a", "x".repeat(300)))
    record(conn, id, 1, { kind: "notice", message: "n" })
    const s = summary(conn, id)
    expect([s.lastEntry, s.preview?.length]).toEqual([2, 200])
    expect(s.lastEventAt).toBeGreaterThan(0)
  })
})
