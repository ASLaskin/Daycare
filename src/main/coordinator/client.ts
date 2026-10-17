// Coordinator socket connection: handshake, snapshot, events and requests.

import { Exit, Schema } from "effect"
import net from "node:net"
import { type Command, type HubEvent, ServerMessage, type Snapshot } from "../../shared/coordinator.ts"
import type { CoordinatorStatus } from "../../shared/ipc.ts"
import type { Json } from "../../shared/json.ts"
import { lineSplitter } from "../../shared/lines.ts"

const RETRY_MS = 2000
// A snapshot holds up to 8 MiB of history per session
const LINE_LIMIT = 256 * 1024 * 1024

const decodeServer = Schema.decodeUnknownExit(Schema.fromJsonString(ServerMessage))

export interface CoordinatorHandlers {
  readonly snapshot: (snapshot: Snapshot) => void
  readonly event: (event: HubEvent) => void
  readonly status: (status: CoordinatorStatus) => void
}

interface Pending {
  readonly resolve: (result: Json) => void
  readonly reject: (error: Error) => void
}

// Reconnects and resubscribes after every drop
export const connect = (socket: string, version: string, on: CoordinatorHandlers) => {
  const pending = new Map<number, Pending>()
  let live: net.Socket | null = null
  let nextId = 1
  let closed = false

  const handle = (s: net.Socket, text: string) => {
    const decoded = decodeServer(text)
    if (Exit.isFailure(decoded)) {
      on.status({ state: "unavailable", message: "coordinator sent a message this app cannot read" })
      s.destroy()
      return
    }
    const msg = decoded.value
    switch (msg.type) {
      case "snapshot":
        live = s
        on.status({ state: "connected" })
        on.snapshot(msg)
        return
      case "event":
        on.event(msg.event)
        return
      case "response": {
        const waiting = pending.get(msg.id)
        pending.delete(msg.id)
        if ("error" in msg) {
          waiting?.reject(new Error(msg.error))
          return
        }
        waiting?.resolve(msg.result)
        return
      }
      case "version_mismatch":
        on.status({ state: "mismatch", coordinator: msg.coordinator, app: version })
        return
      case "error":
        return
    }
  }

  const open = () => {
    on.status({ state: "connecting" })
    const s = net.createConnection(socket)
    s.setEncoding("utf8")
    s.on("connect", () => s.write(`${JSON.stringify({ type: "hello", version })}\n`))
    s.on("data", lineSplitter(LINE_LIMIT, (text) => handle(s, text), () => s.destroy()))
    s.on("error", (e) => on.status({ state: "unavailable", message: e.message }))
    s.on("close", () => {
      live = null
      pending.forEach((p) => p.reject(new Error("coordinator connection closed")))
      pending.clear()
      if (!closed) {
        setTimeout(open, RETRY_MS)
      }
    })
  }

  open()
  return {
    request: (command: Command) =>
      new Promise<Json>((resolve, reject) => {
        if (!live) {
          reject(new Error("coordinator is not connected"))
          return
        }
        const id = nextId++
        pending.set(id, { resolve, reject })
        live.write(`${JSON.stringify({ type: "request", id, command })}\n`)
      }),
    close: () => {
      closed = true
      live?.destroy()
    },
  }
}

export type CoordinatorClient = ReturnType<typeof connect>
