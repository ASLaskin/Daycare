// The Sessions API used by IPC and boot.

import { Effect } from "effect"
import fs from "node:fs"
import type { ChatEvent } from "../../shared/chat.ts"
import type { AccountId, DirPath, RequestId, SessionId } from "../../shared/ids.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import { parseJson } from "../../shared/json.ts"
import type { NewMaster, SessionRecord, SessionView } from "../../shared/session.ts"
import type { Settings } from "../../shared/settings.ts"
import type { AccountInUse } from "../accounts/actions.ts"
import { makeSessionAccountActions } from "./accounts.ts"
import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import { type CreateOptions, decodeRecords, type Session, view } from "./model.ts"

export interface SessionsShape {
  readonly list: Effect.Effect<ReadonlyArray<SessionView>>
  readonly get: (id: SessionId) => Effect.Effect<SessionView | null>
  readonly create: (options: CreateOptions) => Effect.Effect<SessionView>
  readonly createMaster: (options: NewMaster) => Effect.Effect<SessionView>
  readonly rename: (id: SessionId, name: string) => Effect.Effect<void>
  readonly close: (id: SessionId) => Effect.Effect<void>
  readonly reopen: (id: SessionId) => Effect.Effect<void>
  readonly remove: (id: SessionId) => Effect.Effect<void>
  readonly chatSend: (id: SessionId, text: string) => Effect.Effect<void>
  readonly chatInterrupt: (id: SessionId) => Effect.Effect<void>
  readonly setModel: (id: SessionId, model: string) => Effect.Effect<void>
  readonly chatRespond: (id: SessionId, requestId: RequestId, decision: PermissionDecision) => Effect.Effect<boolean>
  readonly chatHistory: (id: SessionId) => Effect.Effect<ReadonlyArray<ChatEvent>>
  readonly restore: Effect.Effect<void>
  readonly switchAccount: (to: AccountId) => Effect.Effect<Settings>
  readonly removeAccount: (id: AccountId) => Effect.Effect<Settings, AccountInUse>
  // Folders whose project skills apply
  readonly projectDirs: Effect.Effect<ReadonlyArray<DirPath>>
  // Coordinator mode only; interrupts running work
  readonly restartCoordinator: Effect.Effect<void>
}

export const deleteDetail = (workers: number) =>
  workers
    ? `This ends it and its ${workers} worker${workers === 1 ? "" : "s"} and removes them from Daycare.`
    : "This ends it and removes it from Daycare."

const readSaved = (file: string): Array<SessionRecord> => {
  try {
    return decodeRecords(parseJson(fs.readFileSync(file, "utf8")))
  } catch {
    return []
  }
}

export const makeService = (core: Core, lifecycle: Lifecycle): SessionsShape => {
  const { sessions, deps, run } = core
  const { chat, ui, settings } = deps

  const withMaster = (id: SessionId, f: (m: Session) => void) =>
    Effect.sync(() => {
      const m = core.masterById(id)
      if (m) {
        f(m)
      }
    })

  const familyOf = (master: Session) => [master, ...core.childrenOf(master.id)]

  const closeOne = (s: Session) => {
    if (s.status === "closed" || s.closing) {
      return
    }
    s.closing = true
    if (core.isRunning(s)) {
      lifecycle.killSession(s)
      return
    }
    lifecycle.sessionExited(s)
  }

  const reopenOne = (s: Session) => {
    if (s.status !== "closed") {
      return
    }
    s.status = "starting"
    ui.send("session:created", view(s))
    lifecycle.startSession(s, true)
  }

  const restoreRecord = (r: SessionRecord) =>
    lifecycle.createSession(
      {
        role: r.role,
        cwd: r.cwd,
        model: r.model,
        permissionMode: r.permissionMode,
        name: r.name,
        accountId: r.accountId,
        ...(r.parentId ? { parentId: r.parentId } : {}),
      },
      r,
    )

  const accountActions = makeSessionAccountActions(core, lifecycle)

  return {
    ...accountActions,
    list: Effect.sync(() => [...sessions.values()].map(view)),
    get: (id) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        return s ? view(s) : null
      }),
    create: (options) => Effect.sync(() => view(lifecycle.createSession(options))),
    createMaster: (options) =>
      Effect.sync(() =>
        view(
          lifecycle.createSession({
            role: "master",
            cwd: options.cwd,
            model: options.model,
            permissionMode: options.permissionMode,
            task: options.task,
            name: options.name,
          }),
        ),
      ),
    rename: (id, name) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s || !name.trim()) {
          return
        }
        s.name = name.trim()
        core.update(s)
        core.persist()
      }),
    close: (id) => withMaster(id, (master) => familyOf(master).forEach(closeOne)),
    reopen: (id) =>
      withMaster(id, (master) => {
        familyOf(master).forEach(reopenOne)
        core.persist()
      }),
    remove: (id) =>
      Effect.gen(function* () {
        const s = sessions.get(id)
        if (!s) {
          return
        }
        const workers = s.role === "master" ? core.childrenOf(s.id).length : 0
        const pristine = s.role === "master" && !s.hadTurn && workers === 0
        const ok = pristine || (yield* ui.confirm({
          message: `Delete ${s.name}?`,
          detail: deleteDetail(workers),
          confirmLabel: "Delete",
        }))
        if (!ok) {
          return
        }
        lifecycle.removeSession(s)
        lifecycle.killSession(s)
      }),
    chatSend: (id, text) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s) {
          return
        }
        s.hadTurn = true
        run(chat.send(id, text))
        core.setStatus(s, "working", "thinking")
        core.persist()
      }),
    chatInterrupt: (id) => chat.interrupt(id),
    // Live switch, also used on the next launch
    setModel: (id, model) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s || !model || s.model === model) {
          return
        }
        s.model = model
        run(chat.setModel(id, model))
        core.update(s)
        core.persist()
      }),
    chatRespond: (id, requestId, decision) => chat.respond(id, requestId, decision),
    chatHistory: (id) => chat.history(id),
    // Masters first, then workers whose master survived
    restore: Effect.sync(() => {
      const records = readSaved(core.sessionsFile)
      const masters = records.filter((r) => r.role === "master")
      const masterIds = new Set(masters.map((m) => m.id))
      const workers = records.filter((r) => r.role === "worker" && r.parentId !== null && masterIds.has(r.parentId))
      ;[...masters, ...workers].forEach(restoreRecord)
    }),
    restartCoordinator: Effect.void,
    projectDirs: Effect.gen(function* () {
      const current = yield* settings.get
      const dirs = [...[...sessions.values()].map((s) => s.cwd), ...current.locations.map((l) => l.path)]
      return [...new Set(dirs.filter(Boolean))]
    }),
  }
}
