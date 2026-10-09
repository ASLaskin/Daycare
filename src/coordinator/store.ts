// Session records in the coordinator's SQLite database.

import { Database } from "bun:sqlite"
import { Result, Schema } from "effect"
import { type SessionState, StoredSession } from "../shared/coordinator.ts"
import type { FilePath, SessionId } from "../shared/ids.ts"

const MIGRATIONS = [
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    native_id TEXT,
    role TEXT NOT NULL,
    parent_id TEXT REFERENCES sessions(id),
    name TEXT NOT NULL,
    icon TEXT,
    cwd TEXT NOT NULL,
    model TEXT,
    permission_mode TEXT NOT NULL,
    state TEXT NOT NULL,
    closed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL,
    run INTEGER NOT NULL DEFAULT 0,
    history_bytes INTEGER NOT NULL DEFAULT 0,
    history_evicted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE history (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    seq INTEGER NOT NULL,
    scope INTEGER NOT NULL,
    block TEXT,
    partial INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
  ) WITHOUT ROWID;`,
]

// Active sessions become interrupted, attempted creations incomplete
const INTERRUPT = `UPDATE sessions
  SET state = CASE state WHEN 'running' THEN 'interrupted' ELSE 'incomplete' END
  WHERE (state = 'running'
    OR (state = 'creating' AND EXISTS (SELECT 1 FROM history WHERE session_id = sessions.id)))`

const COLUMNS = `id, provider, native_id, role, parent_id, name, icon, cwd, model, permission_mode,
  state, closed, error, created_at, run`

interface Row {
  readonly id: string
  readonly provider: string
  readonly native_id: string | null
  readonly role: string
  readonly parent_id: string | null
  readonly name: string
  readonly icon: string | null
  readonly cwd: string
  readonly model: string | null
  readonly permission_mode: string
  readonly state: string
  readonly closed: number
  readonly error: string | null
  readonly created_at: number
  readonly run: number
}

export type Loaded = { readonly session: StoredSession } | { readonly error: string }

const decodeSession = Schema.decodeUnknownResult(StoredSession)

const decode = (r: Row): Loaded => {
  const result = decodeSession({
    id: r.id,
    provider: r.provider,
    nativeId: r.native_id,
    role: r.role,
    parentId: r.parent_id,
    name: r.name,
    icon: r.icon,
    cwd: r.cwd,
    model: r.model,
    permissionMode: r.permission_mode,
    state: r.state,
    closed: r.closed === 1,
    error: r.error,
    createdAt: r.created_at,
    run: r.run,
  })
  return Result.isSuccess(result) ? { session: result.success } : { error: `session ${r.id}: ${result.failure.message}` }
}

export const openStore = (file: FilePath): Database => {
  const db = new Database(file, { create: true, strict: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA foreign_keys = ON")
  const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0
  if (version > MIGRATIONS.length) {
    db.close()
    throw new Error(`database schema ${version} is newer than this coordinator's ${MIGRATIONS.length}`)
  }
  db.transaction(() =>
    MIGRATIONS.slice(version).forEach((sql, i) => {
      db.run(sql)
      db.run(`PRAGMA user_version = ${version + i + 1}`)
    }),
  )()
  return db
}

export const createSession = (db: Database, s: StoredSession) => {
  db.query(
    `INSERT INTO sessions (${COLUMNS}) VALUES ($id, $provider, $nativeId, $role, $parentId, $name, $icon, $cwd,
      $model, $permissionMode, $state, $closed, $error, $createdAt, $run)`,
  ).run({ ...s, closed: s.closed ? 1 : 0 })
}

const PATCH_COLUMNS = { nativeId: "native_id", state: "state", error: "error", closed: "closed", name: "name" } as const

export type Patch = Partial<Pick<StoredSession, keyof typeof PATCH_COLUMNS>>

export const patch = (db: Database, id: SessionId, fields: Patch) => {
  const keys = (Object.keys(fields) as Array<keyof Patch>).filter((k) => fields[k] !== undefined)
  if (keys.length === 0) {
    return
  }
  const sets = keys.map((k) => `${PATCH_COLUMNS[k]} = $${k}`).join(", ")
  const values = Object.fromEntries(keys.map((k) => [k, k === "closed" ? Number(fields.closed) : fields[k]!]))
  db.query(`UPDATE sessions SET ${sets} WHERE id = $id`).run({ ...values, id })
}

// Opens a turn: clears the error and marks a created session running
export const startTurn = (db: Database, id: SessionId) => {
  db.query(
    `UPDATE sessions SET error = NULL, state = CASE state WHEN 'creating' THEN 'creating' ELSE 'running' END WHERE id = $id`,
  ).run({ id })
}

// Counts a provider launch and returns its run number
export const startRun = (db: Database, id: SessionId): number =>
  db.query<{ run: number }, { id: SessionId }>("UPDATE sessions SET run = run + 1 WHERE id = $id RETURNING run").get({ id })?.run ?? 0

// Settles a finished turn; incomplete if creation never confirmed
export const finishTurn = (db: Database, id: SessionId) => {
  db.query(`UPDATE sessions SET state = CASE state WHEN 'creating' THEN 'incomplete' ELSE 'idle' END WHERE id = $id`).run({
    id,
  })
}

// Ends one session's live execution
export const interrupt = (db: Database, id: SessionId) => {
  db.query(`${INTERRUPT} AND id = $id`).run({ id })
}

// Deletes a session record and its history
export const deleteSession = (db: Database, id: SessionId) =>
  db.transaction(() => {
    db.query("DELETE FROM history WHERE session_id = $id").run({ id })
    db.query("DELETE FROM sessions WHERE id = $id").run({ id })
  })()

// Marks execution lost to a coordinator restart; returns the sessions it changed
export const recover = (db: Database): ReadonlyArray<SessionId> =>
  db.query<{ id: SessionId }, []>(`${INTERRUPT} RETURNING id`).all().map((r) => r.id)

export const loadSessions = (db: Database): ReadonlyArray<Loaded> =>
  db.query<Row, []>(`SELECT ${COLUMNS} FROM sessions ORDER BY created_at, id`).all().map(decode)

export const getSession = (db: Database, id: SessionId): Loaded | null => {
  const row = db.query<Row, { id: SessionId }>(`SELECT ${COLUMNS} FROM sessions WHERE id = $id`).get({ id })
  return row ? decode(row) : null
}

export const newId = () => crypto.randomUUID()
