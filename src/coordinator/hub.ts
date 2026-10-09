// Single owner of sessions, approvals, persistence and event order.

import type { Database } from "bun:sqlite"
import type { ChatEvent } from "../shared/chat.ts"
import type { Approval, Command, HubEvent, LiveSession, ServerMessage, SessionHistory, Snapshot, StoredSession } from "../shared/coordinator.ts"
import { asNativeId } from "../shared/coordinator.ts"
import { asSessionId, type SessionId } from "../shared/ids.ts"
import type { Json } from "../shared/json.ts"
import { loadHistory, record } from "./history.ts"
import { ACK_MS, makeOrchestration, type WorkerSpec } from "./orchestration.ts"
import type { ProviderHandle, ProviderUpdate } from "./provider.ts"
import * as store from "./store.ts"

export type Launch = (session: StoredSession, update: (u: ProviderUpdate) => void) => ProviderHandle

// False when the subscriber can take no more
export type Subscriber = (msg: ServerMessage) => boolean

// Serialized history one snapshot may carry, under the client's line limit
export const SNAPSHOT_BUDGET = 192 * 1024 * 1024

export type CommandResult = { readonly result: Json } | { readonly error: string }

const REFUSALS = ["deny", "decline", "cancel"]

const approvalKey = (session: SessionId, request: string) => `${session} ${request}`

export const makeHub = (db: Database, launch: Launch, ackMs = ACK_MS) => {
  const recovered = store.recover(db)
  const loaded = store.loadSessions(db)
  const sessions = new Map(loaded.flatMap((l) => ("session" in l ? [[l.session.id, l.session] as const] : [])))
  const unavailable = loaded.flatMap((l) => ("error" in l ? [l.error] : []))
  const providers = new Map<SessionId, { readonly handle: ProviderHandle; readonly run: number }>()
  const approvals = new Map<string, Approval>()
  // Run being launched, current before its handle is stored
  const launching = new Map<SessionId, number>()
  const subscribers = new Set<Subscriber>()
  let seq = 0
  // Set synchronously when shutdown begins; no new work is admitted after
  let stopping: Promise<void> | null = null
  // Re-checks orchestration waits; set once orchestration exists
  let settleWaits = () => {}

  const session = (id: SessionId) => {
    const s = sessions.get(id)
    if (!s) {
      throw new Error(`no such session ${id}`)
    }
    return s
  }

  const live = (s: StoredSession): LiveSession => ({ ...s, live: providers.has(s.id) })

  const broadcast = (event: HubEvent) => {
    seq += 1
    const msg: ServerMessage = { type: "event", seq, event }
    subscribers.forEach((send) => {
      if (!send(msg)) {
        subscribers.delete(send)
      }
    })
    settleWaits()
  }

  const refresh = (id: SessionId) => {
    const loaded = store.getSession(db, id)
    if (!loaded || "error" in loaded) {
      throw new Error(loaded ? loaded.error : `session ${id} vanished`)
    }
    sessions.set(id, loaded.session)
    broadcast({ kind: "session", session: live(loaded.session) })
  }

  // Recorded under the run that produced it, by default the session's latest
  const chat = (id: SessionId, event: ChatEvent, run = session(id).run) => {
    record(db, id, run, event)
    broadcast({ kind: "chat", session: id, event })
  }

  // Ends a turn in progress whose provider is gone, then marks the session interrupted
  const lose = (id: SessionId, reason: string) => {
    const { state } = session(id)
    if (state === "running" || state === "creating") {
      chat(id, { kind: "interrupted", reason })
    }
    store.interrupt(db, id)
  }

  // Withdraws every pending approval of a session
  const cancelApprovals = (id: SessionId) =>
    [...approvals.values()]
      .filter((a) => a.session === id)
      .forEach((a) => {
        approvals.delete(approvalKey(id, a.request))
        chat(id, { kind: "permission-resolved", requestId: a.request, allowed: false, reason: "cancelled" })
      })

  // Output from a run that is no longer live: kept under its own run, never changes state
  const stale = (id: SessionId, run: number, u: ProviderUpdate) => {
    switch (u.type) {
      case "event":
        chat(id, u.event, run)
        return
      case "error":
        chat(id, { kind: "error", message: u.message }, run)
        return
      // The thread exists, so its id is kept
      case "native":
        store.patch(db, id, { nativeId: u.nativeId })
        refresh(id)
        return
      case "created":
      case "approval":
      case "approval-gone":
      case "exited":
        return
    }
  }

  const update = (id: SessionId, run: number, u: ProviderUpdate) => {
    if ((providers.get(id)?.run ?? launching.get(id)) !== run) {
      stale(id, run, u)
      return
    }
    switch (u.type) {
      case "event":
        chat(id, u.event)
        if (u.event.kind !== "turn-end") {
          return
        }
        if (u.event.isError) {
          store.patch(db, id, { error: u.event.text || u.event.stopReason || "turn failed" })
        }
        store.finishTurn(db, id)
        refresh(id)
        return
      case "native":
        store.patch(db, id, { nativeId: u.nativeId })
        refresh(id)
        return
      case "created":
        if (session(id).state === "creating") {
          store.patch(db, id, { state: "running" })
          refresh(id)
        }
        return
      case "approval": {
        // The choices travel with the saved event, so replayed history can offer them
        const event = u.event.kind === "permission" ? { ...u.event, choices: u.choices } : u.event
        const approval: Approval = { session: id, request: u.request, choices: u.choices, event }
        approvals.set(approvalKey(id, u.request), approval)
        broadcast({ kind: "approval", approval })
        chat(id, event)
        return
      }
      case "approval-gone":
        if (approvals.delete(approvalKey(id, u.request))) {
          chat(id, { kind: "permission-resolved", requestId: u.request, allowed: false, reason: "cancelled" })
        }
        return
      case "error":
        store.patch(db, id, { error: u.message })
        chat(id, { kind: "error", message: u.message })
        refresh(id)
        return
      case "exited":
        providers.delete(id)
        lose(id, "the provider stopped")
        cancelApprovals(id)
        refresh(id)
        return
    }
  }

  // The running provider, launched on demand
  const provider = (id: SessionId): ProviderHandle => {
    if (stopping) {
      throw new Error("coordinator is stopping")
    }
    const running = providers.get(id)
    if (running) {
      return running.handle
    }
    const run = store.startRun(db, id)
    refresh(id)
    launching.set(id, run)
    try {
      const handle = launch(session(id), (u) => update(id, run, u))
      providers.set(id, { handle, run })
      return handle
    } catch (e) {
      store.patch(db, id, { error: e instanceof Error ? e.message : String(e) })
      store.interrupt(db, id)
      refresh(id)
      throw e
    } finally {
      launching.delete(id)
    }
  }

  // Coordinator-accepted on return; the promise settles on provider acceptance
  const send = (id: SessionId, text: string): Promise<void> => {
    if (session(id).closed) {
      throw new Error("session is closed")
    }
    const handle = provider(id)
    store.startTurn(db, id)
    chat(id, { kind: "user", text })
    const accepted = handle.input(text)
    refresh(id)
    return accepted
  }

  // UI sends answer on coordinator acceptance; provider refusals arrive as session errors
  const sendAccepted = (id: SessionId, text: string) => {
    send(id, text).catch(() => {})
  }

  // Records a session before any provider process starts
  const createSession = (s: Pick<StoredSession, "provider" | "role" | "parentId" | "name" | "cwd" | "model" | "permissionMode">) => {
    const id = asSessionId(store.newId())
    store.createSession(db, {
      ...s,
      id,
      // Claude takes a caller-chosen id; Codex reports its thread id
      nativeId: s.provider === "claude" ? asNativeId(store.newId()) : null,
      icon: null,
      state: "creating",
      closed: false,
      error: null,
      createdAt: Date.now(),
      run: 0,
    })
    refresh(id)
    return id
  }

  const needsUser = (id: SessionId) => [...approvals.values()].some((a) => a.session === id)

  const orchestration = makeOrchestration(
    {
      session,
      sessions: () => [...sessions.values()],
      needsUser,
      createWorker: (w: WorkerSpec) =>
        createSession({ provider: w.provider, role: "worker", parentId: w.master.id, name: w.name, cwd: w.cwd, model: w.model, permissionMode: w.master.permissionMode }),
      send,
      history: (id) => loadHistory(db, id),
    },
    ackMs,
  )
  settleWaits = orchestration.settle

  // Turns lost to a coordinator that stopped without shutting down
  recovered.filter((id) => sessions.has(id)).forEach((id) => chat(id, { kind: "interrupted", reason: "the coordinator restarted" }))

  // A master with its workers, or a single worker
  const family = (id: SessionId) =>
    session(id).role === "master" ? [id, ...[...sessions.values()].filter((w) => w.parentId === id).map((w) => w.id)] : [id]

  // Stops a session's agent, if any, and withdraws its approvals
  const stopOne = (id: SessionId, reason: string) => {
    const running = providers.get(id)
    running?.handle.close().catch((e: Error) => console.error(`stopping ${id}: ${e.message}`))
    providers.delete(id)
    if (running) {
      lose(id, reason)
    }
    store.interrupt(db, id)
    cancelApprovals(id)
  }

  const run = (command: Command): Json => {
    switch (command.method) {
      case "create": {
        const id = createSession({
          provider: command.provider,
          role: "master",
          parentId: null,
          name: command.name ?? command.prompt.slice(0, 40),
          cwd: command.cwd,
          model: command.model,
          permissionMode: command.permissionMode,
        })
        if (command.prompt) {
          sendAccepted(id, command.prompt)
        }
        return { session: id }
      }
      case "send":
        sendAccepted(command.session, command.text)
        return { accepted: "coordinator" }
      case "interrupt": {
        const running = providers.get(command.session)
        if (!running) {
          throw new Error("session is not running")
        }
        running.handle.interrupt()
        return {}
      }
      case "answer": {
        const key = approvalKey(command.session, command.request)
        const running = providers.get(command.session)
        if (!approvals.has(key) || !running) {
          throw new Error("approval is not pending")
        }
        const { session: id, request, choice } = command
        const answer = {
          choice,
          ...(command.message === undefined ? {} : { message: command.message }),
          ...(command.updatedInput === undefined ? {} : { updatedInput: command.updatedInput }),
        }
        if (!running.handle.answer(request, answer)) {
          throw new Error(`${choice} is not an offered choice`)
        }
        approvals.delete(key)
        chat(id, { kind: "permission-resolved", requestId: request, allowed: !REFUSALS.includes(choice) })
        return {}
      }
      case "close":
        family(command.session).forEach((id) => {
          stopOne(id, "the session was closed")
          store.patch(db, id, { closed: true })
          refresh(id)
        })
        return {}
      case "reopen":
        family(command.session).forEach((id) => {
          store.patch(db, id, { closed: false })
          refresh(id)
        })
        return {}
      case "rename": {
        const name = command.name.trim()
        session(command.session)
        if (name) {
          store.patch(db, command.session, { name })
          refresh(command.session)
        }
        return {}
      }
      // Workers before their master, whose record they reference
      case "remove":
        family(command.session)
          .reverse()
          .forEach((id) => {
            const { parentId } = session(id)
            stopOne(id, "the session was removed")
            store.deleteSession(db, id)
            sessions.delete(id)
            broadcast({ kind: "removed", session: id, parentId })
          })
        return {}
      case "tool":
        throw new Error("tool calls go through hub.tool")
    }
  }

  return {
    command: (command: Command): CommandResult => {
      if (stopping) {
        return { error: "coordinator is stopping" }
      }
      try {
        return { result: run(command) }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    },

    // An orchestration tool for a master; waits stay pending until they settle or signal aborts
    tool: async (master: SessionId, name: string, input: Json, signal: AbortSignal): Promise<CommandResult> => {
      if (stopping) {
        return { error: "coordinator is stopping" }
      }
      try {
        return { result: await orchestration.run(master, name, input, signal) }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    },

    // Snapshot and registration in one step, so no event falls between them
    subscribe: (send: Subscriber, budget = SNAPSHOT_BUDGET): Snapshot => {
      subscribers.add(send)
      const list = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      // Newest sessions first; older ones past the budget are left out
      let used = 0
      const histories = new Map(
        [...list].reverse().map((s): readonly [SessionId, SessionHistory] => {
          const h = loadHistory(db, s.id)
          used += Buffer.byteLength(JSON.stringify(h))
          return [s.id, used > budget ? { error: "history not included: the snapshot is over its size limit" } : h]
        }),
      )
      return {
        type: "snapshot",
        seq,
        sessions: list.map(live),
        unavailable,
        history: Object.fromEntries(list.map((s) => [s.id, histories.get(s.id)!])),
        approvals: [...approvals.values()],
      }
    },

    unsubscribe: (send: Subscriber) => {
      subscribers.delete(send)
    },

    // Stops admitting work, marks running work interrupted, then waits for every provider; idempotent
    shutdown: (): Promise<void> => {
      if (stopping) {
        return stopping
      }
      const closing = [...providers.entries()].map(([id, { handle }]) => {
        providers.delete(id)
        lose(id, "the coordinator stopped")
        cancelApprovals(id)
        return { id, closed: handle.close() }
      })
      stopping = Promise.allSettled(closing.map((c) => c.closed)).then((results) =>
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(`stopping ${closing[i]?.id}: ${r.reason}`)
          }
        }),
      )
      return stopping
    },
  }
}

export type Hub = ReturnType<typeof makeHub>
