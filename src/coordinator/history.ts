// Bounded displayed history per session.

import type { Database } from "bun:sqlite"
import { Result, Schema } from "effect"
import { ChatEvent } from "../shared/chat.ts"
import type { Entry, SessionHistory } from "../shared/coordinator.ts"
import type { SessionId } from "../shared/ids.ts"
import type { HistoryPage, HistoryRow } from "../shared/mobile.ts"

export const LIMIT = 8 * 1024 * 1024
export const ENTRY_LIMIT = 1024 * 1024
// Event JSON one page may carry
export const PAGE_BYTES = 1024 * 1024
const PREVIEW = 64 * 1024
// Characters of assistant text in a session preview
const SUMMARY_PREVIEW = 200

const decodeEvent = Schema.decodeUnknownResult(Schema.fromJsonString(ChatEvent))

// Longest UTF-8 prefix within max bytes
export const utf8Prefix = (text: string, max: number): string => {
  const buf = Buffer.from(text)
  let end = Math.min(max, buf.length)
  while (end < buf.length && end > 0 && (buf[end]! & 0xc0) === 0x80) {
    end -= 1
  }
  return buf.subarray(0, end).toString("utf8")
}

// User message without inline images, counted as omitted
const withoutImages = (event: ChatEvent): ChatEvent =>
  event.kind === "user" && event.images.length ? { ...event, images: [], omittedImages: event.omittedImages + event.images.length } : event

const fits = (text: string) => Buffer.byteLength(text) <= ENTRY_LIMIT

// Stored text; oversized events lose images, else get previewed
const stored = (event: ChatEvent): string => {
  const text = JSON.stringify(event)
  if (fits(text)) {
    return text
  }
  const slim = JSON.stringify(withoutImages(event))
  if (fits(slim)) {
    return slim
  }
  const preview: ChatEvent = { kind: "oversized", original: event.kind, bytes: Buffer.byteLength(text), preview: utf8Prefix(text, PREVIEW) }
  return JSON.stringify(preview)
}

// Next entry from the session counter; never reused
const nextEntry = (db: Database, id: SessionId): Entry => {
  const row = db.query<{ last_entry: number }, { id: SessionId }>("UPDATE sessions SET last_entry = last_entry + 1 WHERE id = $id RETURNING last_entry").get({ id })
  if (!row) {
    throw new Error(`history ${id}: no such session`)
  }
  return row.last_entry
}

const insert = (db: Database, id: SessionId, scope: number, block: string | null, body: string): Entry => {
  const bytes = Buffer.byteLength(body)
  const entry = nextEntry(db, id)
  db.query(
    `INSERT INTO history (session_id, seq, scope, block, partial, bytes, body, at)
     VALUES ($id, $entry, $scope, $block, $partial, $bytes, $body, $at)`,
  ).run({ id, entry, scope, block, partial: block === null ? 0 : 1, bytes, body, at: Date.now() })
  db.query("UPDATE sessions SET history_bytes = history_bytes + $bytes WHERE id = $id").run({ id, bytes })
  return entry
}

// Streamed partials of one block, replaced by its completed text
const removePartials = (db: Database, id: SessionId, scope: number, block: string) => {
  const match = "session_id = $id AND partial = 1 AND scope = $scope AND block = $block"
  db.query(
    `UPDATE sessions SET history_bytes = history_bytes - (SELECT COALESCE(SUM(bytes), 0) FROM history WHERE ${match}) WHERE id = $id`,
  ).run({ id, scope, block })
  db.query(`DELETE FROM history WHERE ${match}`).run({ id, scope, block })
}

// Drops the oldest entries until the newest fit the limit
const evict = (db: Database, id: SessionId) => {
  const total = db.query<{ history_bytes: number }, { id: SessionId }>("SELECT history_bytes FROM sessions WHERE id = $id").get({ id })
  if (!total || total.history_bytes <= LIMIT) {
    return
  }
  db.query(
    `DELETE FROM history WHERE session_id = $id AND seq IN (
      SELECT seq FROM (
        SELECT seq, SUM(bytes) OVER (ORDER BY seq DESC) AS kept FROM history WHERE session_id = $id
      ) WHERE kept > $limit
    )`,
  ).run({ id, limit: LIMIT })
  db.query(
    `UPDATE sessions SET history_evicted = 1,
      history_bytes = (SELECT COALESCE(SUM(bytes), 0) FROM history WHERE session_id = $id)
     WHERE id = $id`,
  ).run({ id })
}

// Persists one event and returns its entry
export const record = (db: Database, id: SessionId, scope: number, event: ChatEvent): Entry =>
  db.transaction(() => {
    if (event.kind === "text") {
      removePartials(db, id, scope, event.block)
    }
    const entry = insert(db, id, scope, event.kind === "text-delta" ? event.block : null, stored(event))
    evict(db, id)
    return entry
  })()

// Retained events oldest first, and whether older ones were discarded
export const loadHistory = (db: Database, id: SessionId): SessionHistory => {
  const session = db.query<{ history_evicted: number }, { id: SessionId }>("SELECT history_evicted FROM sessions WHERE id = $id").get({ id })
  if (!session) {
    return { error: `history ${id}: no such session` }
  }
  const rows = db.query<{ seq: number; body: string }, { id: SessionId }>("SELECT seq, body FROM history WHERE session_id = $id ORDER BY seq").all({ id })
  const decoded = rows.map((r) => ({ seq: r.seq, result: decodeEvent(r.body) }))
  const bad = decoded.find((d) => Result.isFailure(d.result))
  if (bad && Result.isFailure(bad.result)) {
    return { error: `history ${id} entry ${bad.seq}: ${bad.result.failure.message}` }
  }
  return { evicted: session.history_evicted === 1, events: decoded.flatMap((d) => (Result.isSuccess(d.result) ? [d.result.success] : [])) }
}

interface StoredRow {
  readonly seq: number
  readonly body: string
}

// Unreadable rows keep their entry as an error event
const toRow = (r: StoredRow): HistoryRow => {
  const result = decodeEvent(r.body)
  return {
    entry: r.seq,
    event: Result.isSuccess(result) ? result.success : { kind: "error", message: `history entry ${r.seq} could not be read: ${result.failure.message}` },
  }
}

// Rows oldest first, decoded one by one
export const loadRows = (db: Database, id: SessionId): ReadonlyArray<HistoryRow> =>
  db.query<StoredRow, { id: SessionId }>("SELECT seq, body FROM history WHERE session_id = $id ORDER BY seq").all({ id }).map(toRow)

export type Cursor = { readonly before: Entry } | { readonly after: Entry } | null

// Leading rows that fit the byte budget, at least one
const within = (rows: ReadonlyArray<StoredRow>, budget: number): ReadonlyArray<StoredRow> => {
  const kept = rows.reduce<{ rows: Array<StoredRow>; bytes: number; full: boolean }>(
    (acc, r) => {
      const bytes = acc.bytes + Buffer.byteLength(r.body)
      if (acc.full || (acc.rows.length > 0 && bytes > budget)) {
        return { ...acc, full: true }
      }
      acc.rows.push(r)
      return { ...acc, bytes }
    },
    { rows: [], bytes: 0, full: false },
  )
  return kept.rows
}

type Compare = "<" | "<=" | ">" | ">="

const exists = (db: Database, id: SessionId, compare: Compare, entry: Entry) =>
  (db.query<{ found: number }, { id: SessionId; entry: Entry }>(`SELECT EXISTS (SELECT 1 FROM history WHERE session_id = $id AND seq ${compare} $entry) AS found`).get({ id, entry })?.found ?? 0) === 1

// Whether rows lie beyond an empty page's cursor
const aroundEmpty = (db: Database, id: SessionId, cursor: Cursor) => {
  if (cursor === null) {
    return { hasOlder: false, hasNewer: false }
  }
  return "after" in cursor
    ? { hasOlder: exists(db, id, "<=", cursor.after), hasNewer: false }
    : { hasOlder: false, hasNewer: exists(db, id, ">=", cursor.before) }
}

// One page oldest first; newest rows without a cursor
export const page = (db: Database, id: SessionId, cursor: Cursor, limit: number, budget = PAGE_BYTES): HistoryPage | null => {
  const session = db.query<{ history_evicted: number }, { id: SessionId }>("SELECT history_evicted FROM sessions WHERE id = $id").get({ id })
  if (!session) {
    return null
  }
  const forward = cursor !== null && "after" in cursor
  const bound = cursor === null ? "" : forward ? "AND seq > $entry" : "AND seq < $entry"
  const entry = cursor === null ? 0 : "after" in cursor ? cursor.after : cursor.before
  const fetched = db
    .query<StoredRow, { id: SessionId; entry: Entry; limit: number }>(
      `SELECT seq, body FROM history WHERE session_id = $id ${bound} ORDER BY seq ${forward ? "ASC" : "DESC"} LIMIT $limit`,
    )
    .all({ id, entry, limit })
  const kept = within(fetched, budget)
  const rows = (forward ? kept : [...kept].reverse()).map(toRow)
  const first = rows[0]
  const last = rows[rows.length - 1]
  const around =
    first && last ? { hasOlder: exists(db, id, "<", first.entry), hasNewer: exists(db, id, ">", last.entry) } : aroundEmpty(db, id, cursor)
  return { session: id, rows, ...around, evicted: session.history_evicted === 1 }
}

export interface Summary {
  // Newest retained entry
  readonly lastEntry: Entry | null
  // Epoch ms the newest entry was recorded
  readonly lastEventAt: number | null
  // Start of the newest assistant text
  readonly preview: string | null
}

// List row details without loading the transcript
export const summary = (db: Database, id: SessionId): Summary => {
  const last = db
    .query<{ seq: number; at: number | null }, { id: SessionId }>("SELECT seq, at FROM history WHERE session_id = $id ORDER BY seq DESC LIMIT 1")
    .get({ id })
  const text = db
    .query<{ text: string | null }, { id: SessionId }>(
      `SELECT json_extract(body, '$.text') AS text FROM history
       WHERE session_id = $id AND json_extract(body, '$.kind') = 'text' ORDER BY seq DESC LIMIT 1`,
    )
    .get({ id })
  return {
    lastEntry: last?.seq ?? null,
    lastEventAt: last?.at ?? null,
    preview: text?.text ? text.text.slice(0, SUMMARY_PREVIEW) : null,
  }
}
