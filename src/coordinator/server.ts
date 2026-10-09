// Unix socket server: ownership, handshake, snapshot and ordered events.

import { Exit, Schema } from "effect"
import { chmodSync, lstatSync, mkdirSync, rmSync } from "node:fs"
import net from "node:net"
import { ClientMessage, type ServerMessage } from "../shared/coordinator.ts"
import { lineSplitter } from "../shared/lines.ts"
import { lockPath, socketPath } from "../shared/runtime.ts"
import type { Hub, Subscriber } from "./hub.ts"
import { takeLock } from "./lock.ts"

// Unsent bytes a connection may queue beyond its snapshot before it is dropped
export const OUTBOX_LIMIT = 4 * 1024 * 1024
// A connection whose queued output makes no progress this long is dropped
export const STALL_MS = 60_000
const LINE_LIMIT = 16 * 1024 * 1024
// Longest socket path Node can connect to on Linux and macOS
const SOCKET_PATH_MAX = 103

export class AlreadyRunning extends Error {}

const decodeClient = Schema.decodeUnknownExit(Schema.fromJsonString(ClientMessage))

// Directory owned by this user with mode 0700
const privateDir = (dir: string) => {
  mkdirSync(dir, { mode: 0o700, recursive: true })
  const stat = lstatSync(dir)
  const uid = process.getuid?.()
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o777) !== 0o700) {
    throw new Error(`${dir} must be a directory owned by uid ${uid} with mode 0700`)
  }
}

const line = (msg: ServerMessage) => `${JSON.stringify(msg)}\n`

// Complete lines from a socket; unterminated input over the limit ends it
const onLines = (socket: net.Socket, handle: (line: string) => void) => {
  socket.setEncoding("utf8")
  socket.on("data", lineSplitter(LINE_LIMIT, handle, () => socket.destroy()))
}

const connection = (socket: net.Socket, hub: Hub, version: string, stallMs: number) => {
  let subscriber: Subscriber | null = null
  let greeted = false
  let allowance = OUTBOX_LIMIT
  // Pending tool calls, aborted when the connection closes
  const calls = new Set<AbortController>()
  let stall: ReturnType<typeof setInterval> | null = null
  let delivered = 0

  // bytesWritten counts queued bytes too, so delivery is the difference
  const flushed = () => socket.bytesWritten - socket.writableLength

  // Drops a connection whose queued output stops moving
  const watch = () => {
    if (stall || socket.writableLength === 0) {
      return
    }
    delivered = flushed()
    stall = setInterval(() => {
      if (socket.writableLength === 0) {
        clearInterval(stall ?? undefined)
        stall = null
        return
      }
      if (flushed() === delivered) {
        socket.destroy()
        return
      }
      delivered = flushed()
    }, stallMs)
  }

  // Queues one frame, or drops a client whose queue would pass its allowance
  const send: Subscriber = (msg) => {
    if (socket.destroyed) {
      return false
    }
    const frame = line(msg)
    if (socket.writableLength + Buffer.byteLength(frame) > allowance) {
      socket.destroy()
      return false
    }
    socket.write(frame)
    watch()
    return true
  }
  const write = (msg: ServerMessage) => {
    send(msg)
  }

  const greet = (msg: ClientMessage) => {
    if (msg.type !== "hello") {
      write({ type: "error", message: "expected hello" })
      socket.end()
      return
    }
    if (msg.version !== version) {
      socket.end(line({ type: "version_mismatch", coordinator: version, client: msg.version }))
      return
    }
    greeted = true
    if (msg.subscribe === false) {
      write({ type: "ready" })
      return
    }
    subscriber = send
    const snapshot = line(hub.subscribe(send))
    allowance = Buffer.byteLength(snapshot) + OUTBOX_LIMIT
    socket.write(snapshot)
    watch()
  }

  onLines(socket, (text) => {
    const decoded = decodeClient(text)
    if (Exit.isFailure(decoded)) {
      write({ type: "error", message: "bad message" })
      return
    }
    const msg = decoded.value
    if (!greeted) {
      greet(msg)
      return
    }
    if (msg.type === "hello") {
      write({ type: "error", message: "already greeted" })
      return
    }
    const { id, command } = msg
    if (command.method === "tool") {
      const call = new AbortController()
      calls.add(call)
      void hub.tool(command.master, command.name, command.input, call.signal).then((r) => {
        calls.delete(call)
        write({ type: "response", id, ...r })
      })
      return
    }
    // Events the command causes are written before its response
    write({ type: "response", id, ...hub.command(command) })
  })
  socket.on("error", () => socket.destroy())
  socket.on("close", () => {
    clearInterval(stall ?? undefined)
    calls.forEach((c) => c.abort())
    if (subscriber) {
      hub.unsubscribe(subscriber)
    }
  })
}

// Takes single-instance ownership, then builds the hub and serves clients
export const listen = async (dir: string, makeHub: () => Hub, version: string, stallMs = STALL_MS) => {
  const file = socketPath(dir)
  if (Buffer.byteLength(file) > SOCKET_PATH_MAX) {
    throw new Error(`socket path ${file} is longer than ${SOCKET_PATH_MAX} bytes; use a shorter runtime directory`)
  }
  privateDir(dir)
  const lock = takeLock(lockPath(dir))
  if (!lock) {
    throw new AlreadyRunning(`another coordinator owns ${dir}`)
  }
  const hub = makeHub()
  rmSync(file, { force: true })
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    connection(socket, hub, version, stallMs)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(file, resolve)
  })
  chmodSync(file, 0o600)
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        sockets.forEach((s) => s.destroy())
        rmSync(file, { force: true })
        lock.release()
      }),
  }
}
