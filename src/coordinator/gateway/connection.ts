// One phone socket: hello, auth, resume, watch filter, requests, backpressure.

import { Exit, Schema } from "effect"
import { CloseCode, type DeviceId, type ErrorCode, MobileClientMessage, type MobileServerMessage, PROTOCOL_VERSION, type Watch } from "../../shared/mobile.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { Item } from "./replay.ts"
import type { Outcome } from "./outcome.ts"

export const HELLO_MS = 10_000
export const PING_MS = 20_000
export const OUTBOX_LIMIT = 4 * 1024 * 1024
export const STALL_MS = 60_000
export const FRAME_LIMIT = 16 * 1024 * 1024

// Transport side of a socket
export interface Peer {
  readonly send: (text: string) => void
  readonly close: (code: number, reason: string) => void
  // Bytes queued and not yet written
  readonly buffered: () => number
  readonly ping: () => void
}

type Hello = Extract<MobileClientMessage, { type: "hello" }>
type Request = Extract<MobileClientMessage, { type: "request" }>

// What the gateway provides each connection
export interface Host {
  readonly version: string
  // Delay owed before checking a hello
  readonly authDelay: () => number
  readonly authorize: (token: string) => boolean
  // Synchronous: welcome, then replay or snapshot, then live
  readonly attach: (conn: Connection, hello: Hello) => void
  readonly detach: (conn: Connection) => void
  readonly run: (device: DeviceId, request: Request, watch: (w: Watch) => void) => Promise<{ readonly outcome: Outcome; readonly replayed: boolean }>
}

export interface Timers {
  readonly helloMs: number
  readonly pingMs: number
  readonly stallMs: number
}

const decodeClient = Schema.decodeUnknownExit(Schema.fromJsonString(MobileClientMessage))

const NO_WATCH: Watch = { sessions: [], deltas: false }

export interface Connection {
  readonly message: (text: string) => void
  readonly closed: () => void
  // Live or replayed event, filtered by watch
  readonly deliver: (item: Item) => void
  readonly write: (msg: MobileServerMessage) => void
  readonly close: (code: number, reason: string) => void
  readonly device: () => DeviceId | null
}

export const openConnection = (peer: Peer, host: Host, timers: Timers = { helloMs: HELLO_MS, pingMs: PING_MS, stallMs: STALL_MS }): Connection => {
  let phase: "hello" | "checking" | "ready" | "closed" = "hello"
  let device: DeviceId | null = null
  let watching = new Set<SessionId>()
  let deltas = false
  let stalledSince: number | null = null
  let lastBuffered = 0

  const send = (text: string) => {
    if (phase === "closed") {
      return
    }
    const queued = peer.buffered()
    if (queued > 0 && queued + text.length > OUTBOX_LIMIT) {
      conn.close(CloseCode.stalled, "output buffer full")
      return
    }
    peer.send(text)
  }

  const write = (msg: MobileServerMessage) => send(JSON.stringify(msg))

  const fatal = (code: ErrorCode, message: string, close: number) => {
    write({ type: "error", error: { code, message } })
    conn.close(close, message)
  }

  const helloTimer = setTimeout(() => fatal("bad_request", "expected hello", CloseCode.badHello), timers.helloMs)

  // Pings and drops sockets that stop draining
  const tick = () => {
    const queued = peer.buffered()
    if (queued === 0) {
      stalledSince = null
    }
    if (queued > 0 && (stalledSince === null || queued < lastBuffered)) {
      stalledSince = Date.now()
    }
    lastBuffered = queued
    if (stalledSince !== null && Date.now() - stalledSince >= timers.stallMs) {
      conn.close(CloseCode.stalled, "output stalled")
      return
    }
    peer.ping()
  }
  const pinger = setInterval(tick, timers.pingMs)

  const setWatch = (w: Watch) => {
    watching = new Set(w.sessions)
    deltas = w.deltas
  }

  const greet = async (hello: Hello) => {
    if (hello.protocol !== PROTOCOL_VERSION) {
      write({ type: "protocol_mismatch", server: PROTOCOL_VERSION, client: hello.protocol })
      conn.close(CloseCode.protocolMismatch, "protocol mismatch")
      return
    }
    phase = "checking"
    clearTimeout(helloTimer)
    const delay = host.authDelay()
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    if (phase !== "checking") {
      return
    }
    if (!host.authorize(hello.token)) {
      fatal("unauthorized", "wrong pairing token", CloseCode.unauthorized)
      return
    }
    device = hello.device
    setWatch(hello.watch ?? NO_WATCH)
    phase = "ready"
    host.attach(conn, hello)
  }

  const respond = async (req: Request) => {
    const { outcome, replayed } = await host.run(device!, req, setWatch).catch((e: Error) => ({
      outcome: { error: { code: "internal" as const, message: e.message } },
      replayed: false,
    }))
    write("error" in outcome ? { type: "response", id: req.id, error: outcome.error } : { type: "response", id: req.id, result: outcome.result, replayed })
  }

  const conn: Connection = {
    message: (text) => {
      if (phase === "closed") {
        return
      }
      if (Buffer.byteLength(text) > FRAME_LIMIT) {
        fatal("too_large", "frame over 16 MiB", CloseCode.tooLarge)
        return
      }
      const decoded = decodeClient(text)
      if (Exit.isFailure(decoded)) {
        if (phase === "hello") {
          fatal("bad_request", "expected hello", CloseCode.badHello)
          return
        }
        write({ type: "error", error: { code: "bad_request", message: "message did not match the protocol" } })
        return
      }
      const msg = decoded.value
      if (msg.type === "hello") {
        if (phase !== "hello") {
          write({ type: "error", error: { code: "bad_request", message: "already greeted" } })
          return
        }
        void greet(msg)
        return
      }
      if (phase !== "ready") {
        fatal("bad_request", "expected hello", CloseCode.badHello)
        return
      }
      void respond(msg)
    },

    closed: () => {
      if (phase === "closed") {
        return
      }
      const wasReady = phase === "ready"
      phase = "closed"
      clearTimeout(helloTimer)
      clearInterval(pinger)
      if (wasReady) {
        host.detach(conn)
      }
    },

    deliver: (item) => {
      if (phase !== "ready") {
        return
      }
      const e = item.event
      if (e.kind === "chat" && (!watching.has(e.session) || (!deltas && e.event.kind === "text-delta"))) {
        return
      }
      send(`{"type":"event","seq":${item.seq},"event":${item.json}}`)
    },

    write,

    close: (code, reason) => {
      if (phase === "closed") {
        return
      }
      peer.close(code, reason)
      conn.closed()
    },

    device: () => device,
  }

  return conn
}
