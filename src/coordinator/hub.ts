// Single owner of sessions, approvals, persistence and event order.

import type { Database } from "bun:sqlite"
import type { ChatEvent } from "../shared/chat.ts"
import type { Approval, Command, HubEvent, LiveSession, ServerMessage, Snapshot, StoredSession } from "../shared/coordinator.ts"
import { asNativeId } from "../shared/coordinator.ts"
import { asSessionId, type SessionId } from "../shared/ids.ts"
import type { Json } from "../shared/json.ts"
import { loadHistory, record } from "./history.ts"
import type { ProviderHandle, ProviderUpdate } from "./provider.ts"
import * as store from "./store.ts"

export type Launch = (session: StoredSession, update: (u: ProviderUpdate) => void) => ProviderHandle

// False when the subscriber can take no more
export type Subscriber = (msg: ServerMessage) => boolean

export type CommandResult = { readonly result: Json } | { readonly error: string }

const REFUSALS = ["deny", "decline", "cancel"]

const approvalKey = (session: SessionId, request: string) => `${session} ${request}`

export const makeHub = (db: Database, launch: Launch) => {
  store.recover(db)
  const loaded = store.loadSessions(db)
  const sessions = new Map(loaded.flatMap((l) => ("session" in l ? [[l.session.id, l.session] as const] : [])))
  const unavailable = loaded.flatMap((l) => ("error" in l ? [l.error] : []))
  const providers = new Map<SessionId, { readonly handle: ProviderHandle; readonly run: number }>()
  const approvals = new Map<string, Approval>()
  const subscribers = new Set<Subscriber>()
  let seq = 0

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
  }

  const refresh = (id: SessionId) => {
    const loaded = store.getSession(db, id)
    if (!loaded || "error" in loaded) {
      throw new Error(loaded ? loaded.error : `session ${id} vanished`)
    }
    sessions.set(id, loaded.session)
    broadcast({ kind: "session", session: live(loaded.session) })
  }

  const chat = (id: SessionId, event: ChatEvent) => {
    record(db, id, session(id).run, event)
    broadcast({ kind: "chat", session: id, event })
  }

  // Withdraws every pending approval of a session
  const cancelApprovals = (id: SessionId) =>
    [...approvals.values()]
      .filter((a) => a.session === id)
      .forEach((a) => {
        approvals.delete(approvalKey(id, a.request))
        chat(id, { kind: "permission-resolved", requestId: a.request, allowed: false, reason: "cancelled" })
      })

  const update = (id: SessionId, run: number, u: ProviderUpdate) => {
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
      case "created":
        if (session(id).state === "creating") {
          store.patch(db, id, { state: "running" })
          refresh(id)
        }
        return
      case "approval": {
        const approval: Approval = { session: id, request: u.request, choices: u.choices, event: u.event }
        approvals.set(approvalKey(id, u.request), approval)
        broadcast({ kind: "approval", approval })
        chat(id, u.event)
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
        if (providers.get(id)?.run !== run) {
          return
        }
        providers.delete(id)
        store.interrupt(db, id)
        cancelApprovals(id)
        refresh(id)
        return
    }
  }

  // The running provider, launched on demand
  const provider = (id: SessionId): ProviderHandle => {
    const running = providers.get(id)
    if (running) {
      return running.handle
    }
    const run = store.startRun(db, id)
    refresh(id)
    try {
      const handle = launch(session(id), (u) => update(id, run, u))
      providers.set(id, { handle, run })
      return handle
    } catch (e) {
      store.patch(db, id, { error: e instanceof Error ? e.message : String(e) })
      store.interrupt(db, id)
      refresh(id)
      throw e
    }
  }

  const send = (id: SessionId, text: string) => {
    if (session(id).closed) {
      throw new Error("session is closed")
    }
    const handle = provider(id)
    store.startTurn(db, id)
    chat(id, { kind: "user", text })
    handle.input(text)
    refresh(id)
  }

  const run = (command: Command): Json => {
    switch (command.method) {
      case "create": {
        if (command.provider !== "claude") {
          throw new Error(`${command.provider} sessions are not available yet`)
        }
        const id = asSessionId(store.newId())
        store.createSession(db, {
          id,
          provider: command.provider,
          nativeId: asNativeId(store.newId()),
          role: "master",
          parentId: null,
          name: command.name ?? command.prompt.slice(0, 40),
          icon: null,
          cwd: command.cwd,
          model: command.model,
          permissionMode: command.permissionMode,
          state: "creating",
          closed: false,
          error: null,
          createdAt: Date.now(),
          run: 0,
        })
        refresh(id)
        if (command.prompt) {
          send(id, command.prompt)
        }
        return { session: id }
      }
      case "send":
        send(command.session, command.text)
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
      case "close": {
        const id = command.session
        session(id)
        providers
          .get(id)
          ?.handle.close()
          .catch((e: Error) => console.error(`stopping ${id}: ${e.message}`))
        providers.delete(id)
        store.interrupt(db, id)
        store.patch(db, id, { closed: true })
        cancelApprovals(id)
        refresh(id)
        return {}
      }
    }
  }

  return {
    command: (command: Command): CommandResult => {
      try {
        return { result: run(command) }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    },

    // Snapshot and registration in one step, so no event falls between them
    subscribe: (send: Subscriber): Snapshot => {
      subscribers.add(send)
      const list = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      return {
        type: "snapshot",
        seq,
        sessions: list.map(live),
        unavailable,
        history: Object.fromEntries(list.map((s) => [s.id, loadHistory(db, s.id)])),
        approvals: [...approvals.values()],
      }
    },

    unsubscribe: (send: Subscriber) => {
      subscribers.delete(send)
    },

    // Marks running work interrupted, then waits for every provider to stop
    shutdown: async () => {
      const handles = [...providers.entries()].map(([id, { handle }]) => {
        providers.delete(id)
        store.interrupt(db, id)
        cancelApprovals(id)
        return handle
      })
      await Promise.all(handles.map((h) => h.close()))
    },
  }
}

export type Hub = ReturnType<typeof makeHub>
