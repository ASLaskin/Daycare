// Phone gateway: config, Tailscale binding, connections, replay and push.

import type { Database } from "bun:sqlite"
import type { DirPath } from "../../shared/ids.ts"
import { CloseCode, type DeviceId, type PairingInfo, type PairingStatus, pairingUrl, PROTOCOL_VERSION } from "../../shared/mobile.ts"
import type { Hub } from "../hub.ts"
import { apnsSettings } from "../push/apnsConfig.ts"
import { makeDevices } from "../push/devices.ts"
import type { Push } from "../push/push.ts"
import { makeAuth } from "./auth.ts"
import { makeCommands } from "./commands.ts"
import { type GatewayConfig, ensureConfig, loadConfig, rotateToken } from "./config.ts"
import { type Connection, type Host, openConnection, type Peer, type Timers } from "./connection.ts"
import { makeIdempotency } from "./idempotency.ts"
import { type Listeners, listen as listenAll, type Tls } from "./listener.ts"
import { serveMedia } from "./mediaHttp.ts"
import { messageOf } from "./outcome.ts"
import { makeReplay } from "./replay.ts"
import { mobileEvents, snapshot } from "./snapshot.ts"
import type { Tailscale, TailnetSelf } from "./tailscale.ts"
import { refreshTls, type TlsFiles } from "./tls.ts"

export const RETRY_MS = 30_000
export const RECHECK_MS = 5 * 60_000
export const CERT_MS = 24 * 60 * 60_000
// Close code for a listener restart; phones resume
const RESTART = 1012

export interface Schedule {
  readonly retryMs: number
  readonly recheckMs: number
  readonly certMs: number
}

export interface GatewayDeps {
  readonly hub: Hub
  readonly db: Database
  readonly dir: DirPath
  readonly attachments: DirPath
  readonly version: string
  readonly tailscale: Tailscale
  readonly push: Push
  readonly schedule?: Schedule
  readonly timers?: Timers
  // Tests bind without Tailscale certs
  readonly tls?: (self: TailnetSelf) => Promise<TlsFiles>
}

const sameSelf = (a: TailnetSelf, b: TailnetSelf) => a.host === b.host && a.addresses.join(",") === b.addresses.join(",")

export const makeGateway = (deps: GatewayDeps) => {
  const { hub, db, dir } = deps
  const schedule = deps.schedule ?? { retryMs: RETRY_MS, recheckMs: RECHECK_MS, certMs: CERT_MS }
  const devices = makeDevices(db)
  const idempotency = makeIdempotency(db)
  const commands = makeCommands({ hub, devices, attachments: deps.attachments })
  const connections = new Set<Connection>()
  const byDevice = new Map<DeviceId, Connection>()
  const replay = makeReplay(hub.state().seq)
  let config: GatewayConfig | null = null
  let self: TailnetSelf | null = null
  let tls: TlsFiles | null = null
  let listeners: Listeners | null = null
  let error: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastCert = 0
  let stopped = false

  const auth = makeAuth(() => config!.token)

  hub.observe((seq, event) => {
    const items = mobileEvents(hub, event).map((e) => replay.push(seq, e))
    replay.advance(seq)
    items.forEach((item) => connections.forEach((c) => c.deliver(item)))
  })

  const closeAll = (code: number, reason: string) => [...connections].forEach((c) => c.close(code, reason))

  const host: Host = {
    version: deps.version,
    authDelay: () => auth.delay(),
    authorize: (token) => config !== null && auth.check(token),
    attach: (conn, hello) => {
      byDevice.get(hello.device)?.close(CloseCode.replaced, "replaced by a newer connection")
      byDevice.set(hello.device, conn)
      connections.add(conn)
      const { epoch } = hub.state()
      const items = hello.resume && hello.resume.epoch === epoch ? replay.since(hello.resume.seq) : null
      conn.write({ type: "welcome", protocol: PROTOCOL_VERSION, coordinator: deps.version, epoch, resumed: items !== null })
      if (items === null) {
        conn.write(snapshot(hub))
        return
      }
      items.forEach((item) => conn.deliver(item))
    },
    detach: (conn) => {
      connections.delete(conn)
      const device = conn.device()
      if (device && byDevice.get(device) === conn) {
        byDevice.delete(device)
      }
    },
    run: (device, req, watch) => {
      const work = () => commands({ device, watch }, req.command)
      return req.key ? idempotency.run(device, req.key, req.command.method, work) : work().then((outcome) => ({ outcome, replayed: false }))
    },
  }

  const connect = (peer: Peer) => openConnection(peer, host, deps.timers)

  const media = (req: Request, url: URL) => serveMedia(req, url, hub, auth)

  const unbind = (code: number, reason: string) => {
    listeners?.stop()
    listeners = null
    closeAll(code, reason)
  }

  const bind = (found: TailnetSelf, files: TlsFiles) => {
    const cert: Tls = { cert: files.cert, key: files.key }
    listeners = listenAll(found.addresses, config!.port, cert, { connect, media })
    console.log(`gateway: listening on ${found.addresses.map((a) => `${a}:${config!.port}`).join(", ")} as ${found.host}`)
  }

  const later = (ms: number) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = stopped ? null : setTimeout(() => void check(), ms)
  }

  let checking: Promise<void> | null = null
  // One attempt at a time
  const check = () => {
    checking ??= attempt().finally(() => {
      checking = null
    })
    return checking
  }

  // Binds, rebinds on address or cert change, retries on failure
  const attempt = async () => {
    if (stopped || !config) {
      return
    }
    try {
      const found = await deps.tailscale.self()
      const certDue = !tls || !self || found.host !== self.host || Date.now() - lastCert >= schedule.certMs
      const files = certDue ? await (deps.tls ?? ((s: TailnetSelf) => refreshTls(deps.tailscale, dir, s.host)))(found) : tls!
      lastCert = certDue ? Date.now() : lastCert
      const changed = !listeners || !self || !sameSelf(found, self) || files.cert !== tls?.cert || files.key !== tls?.key
      if (stopped || !config) {
        return
      }
      if (changed) {
        unbind(RESTART, "gateway restarting")
        self = found
        tls = files
        bind(found, files)
      }
      error = null
      push().setHost(found.host)
      later(schedule.recheckMs)
    } catch (e) {
      const message = messageOf(e)
      if (message !== error) {
        console.error(`gateway: ${message}`)
      }
      error = message
      if (listeners && /not running|no addresses/i.test(message)) {
        unbind(RESTART, "Tailscale went down")
      }
      later(listeners ? schedule.recheckMs : schedule.retryMs)
    }
  }

  const push = () => deps.push

  const configurePush = () => {
    const apns = config ? apnsSettings(dir, config.apns) : { settings: null, missing: [] }
    push().configure(apns.settings)
    return apns.missing
  }

  const begin = (loaded: GatewayConfig) => {
    config = loaded
    configurePush()
    later(0)
  }

  const info = (): PairingInfo => {
    const missing = configurePush()
    const c = config!
    return {
      listening: listeners !== null,
      host: self?.host ?? null,
      port: c.port,
      token: c.token,
      url: self ? pairingUrl(self.host, c.port, c.token) : null,
      certExpiresAt: tls?.expiresAt ?? null,
      apnsMissing: missing,
      error,
    }
  }

  return {
    // Starts only once the phone was set up
    start: () => {
      try {
        const loaded = loadConfig(dir)
        if (loaded) {
          begin(loaded)
        }
      } catch (e) {
        error = messageOf(e)
        console.error(`gateway: ${error}`)
      }
    },

    pairing: (): PairingStatus => (config ? info() : null),

    setup: (): PairingInfo => {
      if (!config) {
        begin(ensureConfig(dir))
      }
      return info()
    },

    // New token; every phone must pair again
    rotate: (): PairingInfo => {
      if (!config) {
        begin(ensureConfig(dir))
      }
      config = rotateToken(dir)
      closeAll(CloseCode.unauthorized, "pairing code changed")
      return info()
    },

    stop: () => {
      stopped = true
      if (timer) {
        clearTimeout(timer)
      }
      unbind(CloseCode.stopping, "coordinator stopping")
      push().stop()
    },

    // Waits for the pending bind attempt; tests only
    settle: () => check(),
  }
}

export type Gateway = ReturnType<typeof makeGateway>
