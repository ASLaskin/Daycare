// The coordinator as a launchd LaunchAgent on macOS.

import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"
import type { CoordinatorSetup } from "./paths.ts"
import { writeIfChanged } from "./unitFile.ts"

export const LABEL = "com.daycare.coordinator"

export const agentPath = (home: DirPath) => path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`)

export const logPath = (home: DirPath) => path.join(home, "Library", "Logs", "Daycare", "coordinator.log")

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const string = (value: string) => `<string>${xml(value)}</string>`

export const agentFile = (setup: CoordinatorSetup, home: DirPath) =>
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<!-- Written by Daycare on each launch; edits are overwritten. -->`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>${string(LABEL)}`,
    `  <key>ProgramArguments</key>`,
    `  <array>${string(setup.bun)}${string(setup.script)}</array>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    ...Object.entries(setup.env).map(([key, value]) => `    <key>${xml(key)}</key>${string(value)}`),
    `  </dict>`,
    `  <key>RunAtLoad</key><true/>`,
    `  <!-- Restarts after a crash; a clean stop (exit 0) stays stopped. Exit 3 means another`,
    `       coordinator owns the runtime directory: retried until that one stops, then this takes over. -->`,
    `  <key>KeepAlive</key>`,
    `  <dict><key>SuccessfulExit</key><false/></dict>`,
    `  <key>ThrottleInterval</key><integer>10</integer>`,
    `  <!-- Time to stop providers on SIGTERM before SIGKILL -->`,
    `  <key>ExitTimeOut</key><integer>20</integer>`,
    `  <key>StandardOutPath</key>${string(logPath(home))}`,
    `  <key>StandardErrorPath</key>${string(logPath(home))}`,
    `</dict>`,
    `</plist>`,
    ``,
  ].join("\n")

const domain = () => `gui/${process.getuid?.() ?? 0}`
const target = () => `${domain()}/${LABEL}`

const launchctl = (...args: ReadonlyArray<string>) => execFileSync("/bin/launchctl", args, { stdio: "pipe", timeout: 15_000 })

const loaded = () => {
  try {
    launchctl("print", target())
    return true
  } catch {
    return false
  }
}

// Unloads, ignoring a job that is not loaded
const bootout = () => {
  try {
    launchctl("bootout", target())
  } catch {}
}

const bootstrap = (home: DirPath) => launchctl("bootstrap", domain(), agentPath(home))

// Writes the agent and starts it; running ones keep old config
export const startAgent = (setup: CoordinatorSetup, home: DirPath, running: boolean) => {
  mkdirSync(path.dirname(logPath(home)), { recursive: true })
  const changed = writeIfChanged(agentPath(home), agentFile(setup, home))
  if (loaded() && changed && !running) {
    bootout()
  }
  if (!loaded()) {
    bootstrap(home)
    return
  }
  // Starts the job unless it is already running
  launchctl("kickstart", target())
}

// Reloads the agent with the current config; RunAtLoad starts it
export const reloadAgent = (setup: CoordinatorSetup, home: DirPath) => {
  mkdirSync(path.dirname(logPath(home)), { recursive: true })
  writeIfChanged(agentPath(home), agentFile(setup, home))
  bootout()
  bootstrap(home)
}
