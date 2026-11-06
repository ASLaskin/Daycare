// Session records in the coordinator's SQLite database.

import { Database } from "bun:sqlite"
import { Result, Schema } from "effect"
import { DesktopCatalog } from "../shared/catalog.ts"
import { type SessionState, StoredSession, WorkerEfforts, WorkerModels } from "../shared/coordinator.ts"
import type { FilePath, SessionId } from "../shared/ids.ts"
import { type Json, parseJson } from "../shared/json.ts"
import { baseSettings, KeepAwake } from "../shared/settings.ts"

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
  `ALTER TABLE sessions ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE sessions ADD COLUMN config_dir TEXT;`,
  `CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  `ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE sessions ADD COLUMN effort TEXT;`,
  `ALTER TABLE sessions ADD COLUMN last_entry INTEGER NOT NULL DEFAULT 0;
  UPDATE sessions SET last_entry = (SELECT COALESCE(MAX(seq), 0) FROM history WHERE session_id = sessions.id);
  ALTER TABLE history ADD COLUMN at INTEGER;`,
  `CREATE TABLE mobile_requests (
    key TEXT NOT NULL,
    device TEXT NOT NULL,
    method TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (device, key)
  ) WITHOUT ROWID;
  CREATE INDEX mobile_requests_created ON mobile_requests(created_at);
  CREATE TABLE mobile_devices (
    device TEXT PRIMARY KEY,
    apns_token TEXT NOT NULL,
    environment TEXT NOT NULL,
    push_to_start TEXT,
    kinds TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE mobile_activities (
    activity TEXT PRIMARY KEY,
    device TEXT NOT NULL,
    token TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
]

// Active sessions become interrupted, attempted creations incomplete
const INTERRUPT = `UPDATE sessions
  SET state = CASE state WHEN 'running' THEN 'interrupted' ELSE 'incomplete' END
  WHERE (state = 'running'
    OR (state = 'creating' AND EXISTS (SELECT 1 FROM history WHERE session_id = sessions.id)))`

const COLUMNS = `id, provider, native_id, role, parent_id, name, icon, cwd, model, permission_mode,
  state, closed, archived, error, created_at, run, account_id, config_dir, effort`

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
  readonly archived: number
  readonly error: string | null
  readonly created_at: number
  readonly run: number
  readonly account_id: string
  readonly config_dir: string | null
  readonly effort: string | null
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
    effort: r.effort,
    permissionMode: r.permission_mode,
    state: r.state,
    closed: r.closed === 1,
    archived: r.archived === 1,
    error: r.error,
    createdAt: r.created_at,
    run: r.run,
    accountId: r.account_id,
    configDir: r.config_dir,
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
      $model, $permissionMode, $state, $closed, $archived, $error, $createdAt, $run, $accountId, $configDir, $effort)`,
  ).run({ ...s, closed: s.closed ? 1 : 0, archived: s.archived ? 1 : 0 })
}

const PATCH_COLUMNS = {
  nativeId: "native_id",
  state: "state",
  error: "error",
  closed: "closed",
  archived: "archived",
  name: "name",
  model: "model",
  effort: "effort",
  accountId: "account_id",
  configDir: "config_dir",
} as const

export type Patch = Partial<Pick<StoredSession, keyof typeof PATCH_COLUMNS>>

export const patch = (db: Database, id: SessionId, fields: Patch) => {
  const keys = (Object.keys(fields) as Array<keyof Patch>).filter((k) => fields[k] !== undefined)
  if (keys.length === 0) {
    return
  }
  const sets = keys.map((k) => `${PATCH_COLUMNS[k]} = $${k}`).join(", ")
  const values = Object.fromEntries(keys.map((k) => [k, typeof fields[k] === "boolean" ? Number(fields[k]) : fields[k]!]))
  db.query(`UPDATE sessions SET ${sets} WHERE id = $id`).run({ ...values, id })
}

// Opens a turn
export const startTurn = (db: Database, id: SessionId) => {
  db.query(
    `UPDATE sessions SET error = NULL, state = CASE state WHEN 'creating' THEN 'creating' ELSE 'running' END WHERE id = $id`,
  ).run({ id })
}

// Counts a provider launch and returns its run number
export const startRun = (db: Database, id: SessionId): number =>
  db.query<{ run: number }, { id: SessionId }>("UPDATE sessions SET run = run + 1 WHERE id = $id RETURNING run").get({ id })?.run ?? 0

// Settles a finished turn
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

// Marks running work interrupted after a restart
export const recover = (db: Database): ReadonlyArray<SessionId> =>
  db.query<{ id: SessionId }, []>(`${INTERRUPT} RETURNING id`).all().map((r) => r.id)

export const loadSessions = (db: Database): ReadonlyArray<Loaded> =>
  db.query<Row, []>(`SELECT ${COLUMNS} FROM sessions ORDER BY created_at, id`).all().map(decode)

export const getSession = (db: Database, id: SessionId): Loaded | null => {
  const row = db.query<Row, { id: SessionId }>(`SELECT ${COLUMNS} FROM sessions WHERE id = $id`).get({ id })
  return row ? decode(row) : null
}

const readConfig = (db: Database, key: string): Json | null => {
  const row = db.query<{ value: string }, { key: string }>("SELECT value FROM config WHERE key = $key").get({ key })
  return row ? parseJson(row.value) : null
}

const writeConfig = (db: Database, key: string, value: Json) => {
  db.query("INSERT INTO config (key, value) VALUES ($key, $value) ON CONFLICT (key) DO UPDATE SET value = $value").run({
    key,
    value: JSON.stringify(value),
  })
}

const WORKER_MODELS = "worker_models"

const decodeWorkerModels = Schema.decodeUnknownResult(WorkerModels)

// Last pushed by the app, else the app's defaults
export const loadWorkerModels = (db: Database): WorkerModels => {
  const decoded = decodeWorkerModels(readConfig(db, WORKER_MODELS))
  return Result.isSuccess(decoded) ? decoded.success : { workerModel: baseSettings.workerModel, autoWorkerModel: baseSettings.autoWorkerModel }
}

export const saveWorkerModels = (db: Database, models: WorkerModels) => writeConfig(db, WORKER_MODELS, models)

const WORKER_EFFORTS = "worker_efforts"

const decodeWorkerEfforts = Schema.decodeUnknownResult(WorkerEfforts)

// Last pushed by the app, else the app's defaults
export const loadWorkerEfforts = (db: Database): WorkerEfforts => {
  const decoded = decodeWorkerEfforts(readConfig(db, WORKER_EFFORTS))
  return Result.isSuccess(decoded) ? decoded.success : { workerEffort: baseSettings.workerEffort, autoWorkerEffort: baseSettings.autoWorkerEffort }
}

export const saveWorkerEfforts = (db: Database, efforts: WorkerEfforts) => writeConfig(db, WORKER_EFFORTS, efforts)

const OOGA_BOOGA = "ooga_booga"

// Caveman prompt for providers launched from now on
export const loadOogaBooga = (db: Database): boolean => readConfig(db, OOGA_BOOGA) === true

export const saveOogaBooga = (db: Database, on: boolean) => writeConfig(db, OOGA_BOOGA, on)

const KEEP_AWAKE = "keep_awake"

const decodeKeepAwake = Schema.decodeUnknownResult(KeepAwake)

// Null until a client sets a mode
export const loadKeepAwake = (db: Database): KeepAwake | null => {
  const decoded = decodeKeepAwake(readConfig(db, KEEP_AWAKE))
  return Result.isSuccess(decoded) ? decoded.success : null
}

export const saveKeepAwake = (db: Database, mode: KeepAwake) => writeConfig(db, KEEP_AWAKE, mode)

const CATALOG = "catalog"

const decodeCatalog = Schema.decodeUnknownResult(DesktopCatalog)

// Null until a desktop pushes one
export const loadCatalog = (db: Database): DesktopCatalog | null => {
  const decoded = decodeCatalog(readConfig(db, CATALOG))
  return Result.isSuccess(decoded) ? decoded.success : null
}

export const saveCatalog = (db: Database, catalog: DesktopCatalog) => writeConfig(db, CATALOG, catalog)

export const newId = () => crypto.randomUUID()
