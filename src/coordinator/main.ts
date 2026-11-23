// Coordinator entry: owns agent sessions and serves clients over a Unix socket.

import { mkdirSync, statSync } from "node:fs"
import path from "node:path"
import pkg from "../../package.json" with { type: "json" }
import { asDirPath, asFilePath, type FilePath } from "../shared/ids.ts"
import { startClaude } from "./claude.ts"
import { startCodex } from "./codex.ts"
import { mobileDir } from "./gateway/config.ts"
import { type Gateway, makeGateway } from "./gateway/gateway.ts"
import { pairingRoute } from "./gateway/route.ts"
import { makeTailscale } from "./gateway/tailscale.ts"
import { type Launch, makeHub } from "./hub.ts"
import { http2Transport } from "./push/apns.ts"
import { makeDevices } from "./push/devices.ts"
import { makePush } from "./push/push.ts"
import { caffeinate, noAssertion } from "./power/assertion.ts"
import { pollBattery } from "./power/battery.ts"
import { runtimeDir } from "../shared/runtime.ts"
import { AlreadyRunning, listen } from "./server.ts"
import { openStore } from "./store.ts"
import type { Database } from "bun:sqlite"

// Tells the service supervisor not to restart
export const ALREADY_RUNNING_EXIT = 3

const absolute = (name: string): FilePath => {
  const value = process.env[name]
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be set to an absolute path`)
  }
  return asFilePath(value)
}

const executable = (name: string): FilePath => {
  const file = absolute(name)
  const stat = statSync(file, { throwIfNoEntry: false })
  if (!stat?.isFile() || (stat.mode & 0o111) === 0) {
    throw new Error(`${name}=${file} is not an executable file`)
  }
  return file
}

const launch: Launch = (session, update, options) =>
  session.provider === "codex"
    ? startCodex(session, executable("DAYCARE_CODEX"), update, undefined, options)
    : startClaude(session, executable("DAYCARE_CLAUDE"), update, undefined, options)

const mac = process.platform === "darwin"

const main = async () => {
  const dir = runtimeDir(process.env)
  const db = absolute("DAYCARE_DB")
  mkdirSync(path.dirname(db), { recursive: true, mode: 0o700 })
  let hub: ReturnType<typeof makeHub> | null = null
  let store: Database | null = null
  let gateway: Gateway | null = null
  const server = await listen(
    dir,
    () => {
      store = openStore(db)
      hub = makeHub(store, launch, mac ? { assertion: caffeinate() } : { assertion: noAssertion, powerUnsupported: "Keep awake needs macOS" })
      return hub
    },
    pkg.version,
    undefined,
    pairingRoute(() => gateway),
  )
  console.log(`daycare coordinator ${pkg.version} on ${dir}`)
  const battery = mac ? pollBattery((reading) => hub?.battery(reading)) : null
  const transport = http2Transport()
  gateway = makeGateway({
    hub: hub!,
    db: store!,
    dir: mobileDir(process.env, db),
    attachments: asDirPath(path.join(path.dirname(db), "attachments")),
    version: pkg.version,
    tailscale: makeTailscale(process.env),
    push: makePush({ hub: hub!, devices: makeDevices(store!), transport }),
  })
  gateway.start()

  let stopped: Promise<void> | null = null
  const stop = () => {
    stopped ??= (async () => {
      battery?.stop()
      gateway?.stop()
      transport.close()
      await hub?.shutdown()
      await server.close()
      console.log("daycare coordinator stopped")
      process.exit(0)
    })()
    return stopped
  }
  process.once("SIGTERM", stop)
  process.once("SIGINT", stop)
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(e instanceof AlreadyRunning ? ALREADY_RUNNING_EXIT : 1)
})
