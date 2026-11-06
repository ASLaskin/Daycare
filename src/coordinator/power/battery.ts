// Battery readings from pmset -g batt.

import { execFile } from "node:child_process"
import type { Battery } from "../../shared/power.ts"

export const PMSET = "/usr/bin/pmset"
export const POLL_MS = 60_000
export const LOW_POLL_MS = 20_000
// Below this while discharging, poll faster
const LOW_PERCENT = 25

const PLUGGED = new Set(["charging", "charged", "finishing charge", "ac attached"])
const CHARGING = new Set(["charging", "finishing charge"])

// Null when the output names no battery
export const parseBattery = (out: string, readAt: number): Battery | null => {
  const line = out.split("\n").find((l) => /\d+%;/.test(l))
  const percent = line ? /(\d+)%;/.exec(line)?.[1] : undefined
  if (!line || percent === undefined) {
    return null
  }
  const status = (line.split(";")[1] ?? "").trim().toLowerCase()
  const time = /(\d+):(\d+) remaining/.exec(line)
  return {
    percent: Number(percent),
    pluggedIn: out.includes("'AC Power'") || PLUGGED.has(status),
    charging: CHARGING.has(status),
    minutesRemaining: time ? Number(time[1]) * 60 + Number(time[2]) : null,
    readAt,
  }
}

export const pollInterval = (b: Battery | null) => (b && !b.pluggedIn && b.percent < LOW_PERCENT ? LOW_POLL_MS : POLL_MS)

// Reads now, then on each interval; failed reads are skipped
export const pollBattery = (onReading: (b: Battery | null) => void, command: string = PMSET) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let last: Battery | null = null

  const tick = () => {
    execFile(command, ["-g", "batt"], { timeout: 10_000 }, (err, stdout) => {
      if (stopped) {
        return
      }
      if (!err) {
        last = parseBattery(String(stdout), Date.now())
        onReading(last)
      }
      timer = setTimeout(tick, pollInterval(last))
      timer.unref()
    })
  }

  tick()
  return {
    stop: () => {
      stopped = true
      clearTimeout(timer ?? undefined)
    },
  }
}
