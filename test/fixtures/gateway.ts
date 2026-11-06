// Self signed TLS, free ports and a WebSocket test client for the gateway.

import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { MobileServerMessage } from "../../src/shared/mobile.ts"

// Cert for 127.0.0.1 and localhost, valid one day
export const selfSigned = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "daycare-tls-"))
  const cert = path.join(dir, "c.pem")
  const key = path.join(dir, "k.pem")
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert,
  ], { stdio: "ignore" })
  const files = { cert: readFileSync(cert, "utf8"), key: readFileSync(key, "utf8"), expiresAt: Date.now() + 86_400_000 }
  rmSync(dir, { recursive: true, force: true })
  return files
}

export const freePort = () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const port = server.port!
  server.stop(true)
  return port
}

const INSECURE = { tls: { rejectUnauthorized: false } }

export const insecureFetch = (url: string, init: RequestInit = {}) => fetch(url, { ...init, ...INSECURE })

// Queued server messages and the close code
export const wsClient = (url: string) => {
  // DOM typings lack Bun's options overload
  const ws = new WebSocket(url, INSECURE as unknown as string[])
  const queue: Array<MobileServerMessage> = []
  const waiters: Array<() => void> = []
  let resolveClose: (code: number) => void = () => {}
  const closed = new Promise<number>((resolve) => {
    resolveClose = resolve
  })
  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error("socket error"))
  })
  ws.onmessage = (e) => {
    queue.push(JSON.parse(String(e.data)) as MobileServerMessage)
    waiters.splice(0).forEach((w) => w())
  }
  ws.onclose = (e) => {
    resolveClose(e.code)
    waiters.splice(0).forEach((w) => w())
  }

  // Next message, failing after ms
  const next = async (ms = 2000): Promise<MobileServerMessage> => {
    const deadline = Date.now() + ms
    while (queue.length === 0) {
      if (Date.now() > deadline || ws.readyState === WebSocket.CLOSED) {
        throw new Error(`no message within ${ms} ms`)
      }
      await Promise.race([new Promise<void>((r) => waiters.push(r)), Bun.sleep(Math.max(1, deadline - Date.now()))])
    }
    return queue.shift()!
  }

  return {
    ws,
    opened,
    closed,
    next,
    queued: () => queue.length,
    send: (msg: object) => ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
  }
}

export type WsClient = ReturnType<typeof wsClient>
