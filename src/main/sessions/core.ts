// Shared session state and the updates every handler uses.

import { Deferred, Effect } from "effect"
import fs from "node:fs"
import path from "node:path"
import type { SessionId } from "../../shared/ids.ts"
import type { SessionStatus } from "../../shared/session.ts"
import type { Accounts } from "../accounts/Accounts.ts"
import type { AppPaths } from "../AppPaths.ts"
import type { Ui } from "../Ui.ts"
import type { Chat } from "../chat/Chat.ts"
import type { ControlEndpoint } from "../control/ControlServer.ts"
import type { Power } from "../power/Power.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"
import type { Usage } from "../usage/Usage.ts"
import { isSettled, record, type Session, view } from "./model.ts"

export interface SessionDeps {
  readonly accounts: Accounts["Service"]
  readonly chat: Chat["Service"]
  readonly power: Power["Service"]
  readonly settings: SettingsStore["Service"]
  readonly usage: Usage["Service"]
  readonly ui: Ui["Service"]
  readonly endpoint: ControlEndpoint["Service"]
  readonly paths: AppPaths["Service"]
}

export interface Waiter {
  readonly ids: ReadonlyArray<SessionId>
  readonly done: Deferred.Deferred<void>
}

export interface Core {
  readonly deps: SessionDeps
  readonly sessions: Map<SessionId, Session>
  readonly waiters: Set<Waiter>
  readonly sessionsFile: string
  readonly mcpDir: string
  readonly isQuitting: () => boolean
  readonly quit: () => void
  readonly run: <A>(effect: Effect.Effect<A>) => A
  readonly runBackground: <A>(effect: Effect.Effect<A>) => void
  readonly childrenOf: (masterId: SessionId) => Array<Session>
  readonly masterById: (id: SessionId) => Session | null
  readonly isRunning: (s: Session) => boolean
  readonly persist: () => void
  readonly notify: (s: Session, what: string, body: string) => void
  readonly syncPower: () => void
  readonly flushWaiters: () => void
  readonly update: (s: Session) => void
  readonly setStatus: (s: Session, status: SessionStatus, activity?: string) => void
}

export const later = (ms: number, f: () => void) => setTimeout(f, ms).unref()

const POWER_SYNC_DELAY_MS = 400

export const makeCore = (deps: SessionDeps): Core => {
  const { chat, power, settings, ui, paths } = deps
  const sessions = new Map<SessionId, Session>()
  const waiters = new Set<Waiter>()
  const sessionsFile = path.join(paths.userData, "sessions.json")
  const mcpDir = path.join(paths.userData, "mcp")
  let quitting = false

  const run = <A>(effect: Effect.Effect<A>) => Effect.runSync(effect)
  const runBackground = <A>(effect: Effect.Effect<A>) => void Effect.runFork(effect)

  const all = () => [...sessions.values()]
  const childrenOf = (masterId: SessionId) => all().filter((s) => s.parentId === masterId)
  const masterById = (id: SessionId) => {
    const s = sessions.get(id)
    return s?.role === "master" ? s : null
  }
  const isRunning = (s: Session) => run(chat.has(s.id))

  // Write sessions.json atomically
  const persist = () => {
    fs.mkdirSync(paths.userData, { recursive: true })
    const tmp = `${sessionsFile}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(all().map(record), null, 2))
    fs.renameSync(tmp, sessionsFile)
  }

  const notify = (s: Session, what: string, body: string) => ui.notify(`${s.name} ${what}`, body)

  // Keep the Mac awake while any session is busy
  const syncPower = () => {
    const live = all().filter(isRunning)
    const busy = live.filter((s) => !isSettled(s))
    const current = run(settings.get)
    run(power.apply({ mode: current.keepAwake, lidClosed: current.keepAwakeLidClosed, activeCount: live.length, busyCount: busy.length }))
  }

  let powerTimer: ReturnType<typeof setTimeout> | null = null
  // Coalesced power sync
  const schedulePowerSync = () => {
    powerTimer ??= later(POWER_SYNC_DELAY_MS, () => {
      powerTimer = null
      syncPower()
    })
  }

  // Release waiters whose sessions all settled
  const flushWaiters = () => {
    ;[...waiters]
      .filter((w) => w.ids.map((id) => sessions.get(id)).filter((s) => s !== undefined).every(isSettled))
      .forEach((w) => run(Deferred.succeed(w.done, undefined)))
  }

  const update = (s: Session) => ui.send("session:update", view(s))

  const setStatus = (s: Session, status: SessionStatus, activity?: string) => {
    s.status = status
    if (activity !== undefined) {
      s.activity = activity
    }
    update(s)
    if (isSettled(s)) {
      flushWaiters()
    }
    schedulePowerSync()
  }

  return {
    deps,
    sessions,
    waiters,
    sessionsFile,
    mcpDir,
    isQuitting: () => quitting,
    quit: () => {
      quitting = true
    },
    run,
    runBackground,
    childrenOf,
    masterById,
    isRunning,
    persist,
    notify,
    syncPower,
    flushWaiters,
    update,
    setStatus,
  }
}
