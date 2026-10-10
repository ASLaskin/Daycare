// Bounded displayed history per session.

import type { Database } from "bun:sqlite"
import { Result, Schema } from "effect"
import { ChatEvent } from "../shared/chat.ts"
import type { SessionHistory } from "../shared/coordinator.ts"
import type { SessionId } from "../shared/ids.ts"

export const LIMIT = 8 * 1024 * 1024
export const ENTRY_LIMIT = 1024 * 1024
const PREVIEW = 64 * 1024

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

// Stored text for an event, previewed when oversized
const stored = (event: ChatEvent): string => {
  const text = JSON.stringify(event)
  const bytes = Buffer.byteLength(text)
  if (bytes <= ENTRY_LIMIT) {
    return text
  }
  const preview: ChatEvent = { kind: "oversized", original: event.kind, bytes, preview: utf8Prefix(text, PREVIEW) }
  return JSON.stringify(preview)
}

const insert = (db: Database, id: SessionId, scope: number, block: string | null, body: string) => {
  const bytes = Buffer.byteLength(body)
  db.query(
    `INSERT INTO history (session_id, seq, scope, block, partial, bytes, body)
     VALUES ($id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM history WHERE session_id = $id), $scope, $block, $partial, $bytes, $body)`,
  ).run({ id, scope, block, partial: block === null ? 0 : 1, bytes, body })
  db.query("UPDATE sessions SET history_bytes = history_bytes + $bytes WHERE id = $id").run({ id, bytes })
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

// Persists one event
export const record = (db: Database, id: SessionId, scope: number, event: ChatEvent) =>
  db.transaction(() => {
    if (event.kind === "text") {
      removePartials(db, id, scope, event.block)
    }
    insert(db, id, scope, event.kind === "text-delta" ? event.block : null, stored(event))
    evict(db, id)
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
