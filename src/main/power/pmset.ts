// Privileged pmset commands and the revert watchdog.

import fs from "node:fs"
import type { PowerConfig } from "./config.ts"

export const AUTH_TIMEOUT_MS = 120000
export const WATCHDOG_POLL_S = 2

const shellQuote = (value: string | number) => `'${String(value).split("'").join(`'\\''`)}'`

// osascript args running a shell command as admin.
export const osaArgs = (shellCommand: string) => {
  const escaped = shellCommand.split("\\").join("\\\\").split('"').join('\\"')
  return ["-e", `do shell script "${escaped}" with administrator privileges`]
}

// Disables sleep and starts a root watchdog that reverts it.
export const enableLidArgs = ({ pmset, sentinel }: PowerConfig) => {
  const watch =
    `/usr/bin/nohup /bin/sh -c 'while /bin/kill -0 "$1" 2>/dev/null && [ ! -f "$2" ]; do /bin/sleep ${WATCHDOG_POLL_S}; done; ` +
    `${pmset} -a disablesleep 0; /bin/rm -f "$2"' daycare ${shellQuote(process.pid)} ${shellQuote(sentinel)} >/dev/null 2>&1 &`
  return osaArgs(`${pmset} -a disablesleep 1; ${watch}`)
}

export const disableLidArgs = ({ pmset }: PowerConfig) => osaArgs(`${pmset} -a disablesleep 0`)

// Writes the sentinel, telling the watchdog to revert.
export const dropSentinel = (sentinel: string, sync: boolean) => {
  try {
    if (sync) {
      fs.writeFileSync(sentinel, String(Date.now()))
      return
    }
    fs.writeFile(sentinel, String(Date.now()), () => {})
  } catch {}
}

export const clearSentinel = (sentinel: string) => {
  try {
    fs.rmSync(sentinel, { force: true })
  } catch {}
}
