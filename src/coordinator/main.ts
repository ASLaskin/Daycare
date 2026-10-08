// Coordinator entry: owns agent sessions and serves clients over a Unix socket.

import { statSync } from "node:fs"
import path from "node:path"
import pkg from "../../package.json" with { type: "json" }
import { asFilePath, type FilePath } from "../shared/ids.ts"
import { startClaude } from "./claude.ts"
import { startCodex } from "./codex.ts"
import { type Launch, makeHub } from "./hub.ts"
import { AlreadyRunning, listen, runtimeDir } from "./server.ts"
import { openStore } from "./store.ts"

// Tells the service supervisor not to restart
export const ALREADY_RUNNING_EXIT = 3

const absolute = (name: string): FilePath => {
  const value = process.env[name]
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be set to an absolute path`)
  }
  return asFilePath(value)
}

// Checked per launch, so a missing provider leaves the coordinator running
const executable = (name: string): FilePath => {
  const file = absolute(name)
  const stat = statSync(file, { throwIfNoEntry: false })
  if (!stat?.isFile() || (stat.mode & 0o111) === 0) {
    throw new Error(`${name}=${file} is not an executable file`)
  }
  return file
}

const launch: Launch = (session, update) =>
  session.provider === "codex" ? startCodex(session, executable("DAYCARE_CODEX"), update) : startClaude(session, executable("DAYCARE_CLAUDE"), update)

const main = async () => {
  const dir = runtimeDir(process.env)
  const db = absolute("DAYCARE_DB")
  let hub: ReturnType<typeof makeHub> | null = null
  const server = await listen(
    dir,
    () => {
      hub = makeHub(openStore(db), launch)
      return hub
    },
    pkg.version,
  )
  console.log(`daycare coordinator ${pkg.version} on ${dir}`)

  let stopped: Promise<void> | null = null
  const stop = () => {
    stopped ??= (async () => {
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
