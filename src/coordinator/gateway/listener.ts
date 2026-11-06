// HTTPS and WebSocket servers, one per Tailscale address.

import type { Server, ServerWebSocket } from "bun"
import { type Connection, FRAME_LIMIT, type Peer } from "./connection.ts"
import { MEDIA_PREFIX } from "./mediaHttp.ts"

export interface Tls {
  readonly cert: string
  readonly key: string
}

export interface ListenerHandlers {
  readonly connect: (peer: Peer) => Connection
  readonly media: (req: Request, url: URL) => Promise<Response>
}

interface SocketData {
  conn: Connection | null
}

// Above the frame limit so oversized frames get 4413, not 1009
const PAYLOAD_LIMIT = FRAME_LIMIT * 2

const peerOf = (ws: ServerWebSocket<SocketData>): Peer => ({
  send: (text) => {
    ws.send(text)
  },
  close: (code, reason) => ws.close(code, reason),
  buffered: () => ws.getBufferedAmount(),
  ping: () => {
    ws.ping()
  },
})

const serveOne = (hostname: string, port: number, tls: Tls, on: ListenerHandlers): Server<SocketData> =>
  Bun.serve<SocketData>({
    hostname,
    port,
    tls: { cert: tls.cert, key: tls.key },
    fetch: (req, server) => {
      const url = new URL(req.url)
      if (url.pathname === "/ws") {
        return server.upgrade(req, { data: { conn: null } }) ? undefined : new Response("expected a WebSocket upgrade", { status: 426 })
      }
      if (url.pathname.startsWith(MEDIA_PREFIX)) {
        return on.media(req, url)
      }
      return new Response(null, { status: 404 })
    },
    websocket: {
      maxPayloadLength: PAYLOAD_LIMIT,
      // Our own pings run every 20 s
      sendPings: false,
      // Seconds without any frame, pongs included
      idleTimeout: 120,
      open: (ws) => {
        ws.data.conn = on.connect(peerOf(ws))
      },
      message: (ws, message) => {
        if (typeof message !== "string") {
          ws.data.conn?.message("")
          return
        }
        ws.data.conn?.message(message)
      },
      close: (ws) => {
        ws.data.conn?.closed()
      },
    },
  })

// All servers up, or none
export const listen = (addresses: ReadonlyArray<string>, port: number, tls: Tls, on: ListenerHandlers) => {
  const servers: Array<Server<SocketData>> = []
  try {
    addresses.forEach((a) => servers.push(serveOne(a, port, tls, on)))
  } catch (e) {
    servers.forEach((s) => s.stop(true))
    throw e
  }
  return {
    addresses,
    stop: () => servers.forEach((s) => s.stop(true)),
  }
}

export type Listeners = ReturnType<typeof listen>
