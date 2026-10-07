// Unix socket server: ownership, handshake, snapshot and ordered events.

import { Exit, Schema } from "effect"
import { chmodSync, lstatSync, mkdirSync, rmSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { ClientMessage, type ServerMessage } from "../shared/coordinator.ts"
import { asFilePath, type FilePath } from "../shared/ids.ts"
import { lineSplitter } from "../shared/lines.ts"
import type { Hub, Subscriber } from "./hub.ts"
import { takeLock } from "./lock.ts"

// Unsent bytes a subscriber may queue before it is dropped
export const OUTBOX_LIMIT = 4 * 1024 * 1024
const LINE_LIMIT = 16 * 1024 * 1024
// Longest socket path Node can connect to on Linux and macOS
const SOCKET_PATH_MAX = 103

export class AlreadyRunning extends Error {}

const decodeClient = Schema.decodeUnknownExit(Schema.fromJsonString(ClientMessage))

export const runtimeDir = (env: NodeJS.ProcessEnv): string => {
  const dir = env["DAYCARE_RUNTIME_DIR"]
  if (dir) {
    return dir
  }
  const base = env["XDG_RUNTIME_DIR"]
  if (!base) {
    throw new Error("XDG_RUNTIME_DIR or DAYCARE_RUNTIME_DIR must be set")
  }
  return path.join(base, "daycare")
}

export const socketPath = (dir: string): FilePath => asFilePath(path.join(dir, "coordinator.sock"))

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

const connection = (socket: net.Socket, hub: Hub, version: string) => {
  let subscriber: Subscriber | null = null
  const write = (msg: ServerMessage) => socket.write(line(msg))

  // Queues an event, or drops a client that has fallen behind
  const send: Subscriber = (msg) => {
    if (socket.destroyed) {
      return false
    }
    if (socket.writableLength > OUTBOX_LIMIT) {
      socket.end(line({ type: "dropped", reason: "client fell behind; reconnect for a fresh snapshot" }))
      return false
    }
    write(msg)
    return true
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
    subscriber = send
    write(hub.subscribe(send))
  }

  onLines(socket, (text) => {
    const decoded = decodeClient(text)
    if (Exit.isFailure(decoded)) {
      write({ type: "error", message: "bad message" })
      return
    }
    const msg = decoded.value
    if (!subscriber) {
      greet(msg)
      return
    }
    if (msg.type === "hello") {
      write({ type: "error", message: "already greeted" })
      return
    }
    // Events the command causes are written before its response
    write({ type: "response", id: msg.id, ...hub.command(msg.command) })
  })
  socket.on("error", () => socket.destroy())
  socket.on("close", () => {
    if (subscriber) {
      hub.unsubscribe(subscriber)
    }
  })
}

// Takes single-instance ownership, then builds the hub and serves clients
export const listen = async (dir: string, makeHub: () => Hub, version: string) => {
  const file = socketPath(dir)
  if (Buffer.byteLength(file) > SOCKET_PATH_MAX) {
    throw new Error(`socket path ${file} is longer than ${SOCKET_PATH_MAX} bytes; use a shorter runtime directory`)
  }
  privateDir(dir)
  const lock = takeLock(asFilePath(path.join(dir, "coordinator.lock")))
  if (!lock) {
    throw new AlreadyRunning(`another coordinator owns ${dir}`)
  }
  const hub = makeHub()
  rmSync(file, { force: true })
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    connection(socket, hub, version)
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
