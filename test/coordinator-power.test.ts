// Coordinator keep awake: pmset parsing, the caffeinate assertion and the power state.

import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { type Assertion, caffeinate } from "../src/coordinator/power/assertion.ts"
import { LOW_POLL_MS, parseBattery, POLL_MS, pollInterval } from "../src/coordinator/power/battery.ts"
import { makePower } from "../src/coordinator/power/power.ts"
import type { PowerState } from "../src/shared/power.ts"
import type { KeepAwake } from "../src/shared/settings.ts"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-cpower-"))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

describe("pmset -g batt", () => {
  test("charging with an estimate", () => {
    const out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=22413411)\t79%; charging; 1:21 remaining present: true\n"
    expect(parseBattery(out, 5)).toEqual({ percent: 79, pluggedIn: true, charging: true, minutesRemaining: 81, readAt: 5 })
  })

  test("discharging while macOS is still estimating", () => {
    const out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t18%; discharging; (no estimate) present: true\n"
    expect(parseBattery(out, 1)).toEqual({ percent: 18, pluggedIn: false, charging: false, minutesRemaining: null, readAt: 1 })
  })

  test("plugged in but not charging", () => {
    const out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true\n"
    expect(parseBattery(out, 1)).toMatchObject({ percent: 80, pluggedIn: true, charging: false, minutesRemaining: null })
  })

  test("a Mac without a battery has no reading", () => {
    expect(parseBattery("Now drawing from 'AC Power'\n", 1)).toBeNull()
  })

  test("low and discharging polls faster", () => {
    const low = { percent: 20, pluggedIn: false, charging: false, minutesRemaining: 30, readAt: 1 }
    expect(pollInterval(low)).toBe(LOW_POLL_MS)
    expect(pollInterval({ ...low, pluggedIn: true })).toBe(POLL_MS)
    expect(pollInterval(null)).toBe(POLL_MS)
  })
})

// Assertion that records holds and can be lost on demand
const fakeAssertion = () => {
  let lost: ((reason: string) => void) | null = null
  let holds = 0
  const assertion: Assertion = {
    hold: (onLost) => {
      if (!lost) {
        holds += 1
        lost = onLost
      }
    },
    release: () => {
      lost = null
    },
    held: () => lost !== null,
  }
  const lose = (reason: string) => {
    const report = lost
    lost = null
    report?.(reason)
  }
  return { assertion, holds: () => holds, lose }
}

const powerWith = (saved: KeepAwake | null = null) => {
  const fake = fakeAssertion()
  const states: Array<PowerState> = []
  const saves: Array<KeepAwake> = []
  const power = makePower({ assertion: fake.assertion, load: () => saved, save: (m) => saves.push(m), onChange: (s) => states.push(s) })
  return { power, fake, states, saves }
}

describe("power state", () => {
  test("while running holds only for busy sessions and reuses one assertion", () => {
    const { power, fake } = powerWith()
    expect(power.state().mode).toBe("while-running")
    power.setBusy(1)
    power.setBusy(2)
    expect([power.state().holding, fake.holds()]).toEqual([true, 1])
    power.setBusy(0)
    expect(power.state().holding).toBe(false)
  })

  test("modes are saved; an initial mode never overrides a stored one", () => {
    const fresh = powerWith()
    fresh.power.setMode("always", true)
    expect([fresh.power.state().holding, fresh.saves]).toEqual([true, ["always"]])
    fresh.power.setMode("off", true)
    expect(fresh.power.state().mode).toBe("always")
    const stored = powerWith("off")
    stored.power.setMode("always", true)
    expect([stored.power.state().mode, stored.saves]).toEqual(["off", []])
  })

  test("a lost assertion is reported until the mode is set again", () => {
    const { power, fake } = powerWith()
    power.setMode("always")
    fake.lose("gone")
    expect([power.state().holding, power.state().error]).toEqual([false, "gone"])
    power.setMode("always")
    expect([power.state().holding, power.state().error]).toEqual([true, null])
  })

  test("only real changes are published, so a fresh reading time alone is quiet", () => {
    const { power, states } = powerWith()
    const reading = { percent: 50, pluggedIn: false, charging: false, minutesRemaining: 90, readAt: 1 }
    power.setBattery(reading)
    power.setBattery({ ...reading, readAt: 2 })
    power.setLid({ enabled: true, active: true })
    expect(states.map((s) => [s.battery?.percent, s.lidClosed?.active ?? null])).toEqual([[50, null], [50, true]])
  })
})

const until = async (check: () => boolean) => {
  const deadline = Date.now() + 5000
  while (!check() && Date.now() < deadline) {
    await Bun.sleep(10)
  }
  expect(check()).toBe(true)
}

test("caffeinate is held with -i -w and reports an unexpected exit", async () => {
  const log = path.join(root, "args")
  const bin = path.join(root, "caffeinate")
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s ' "$@" > "${log}"\nexec sleep 30\n`, { mode: 0o755 })
  const assertion = caffeinate(bin, 4242)
  const lost: Array<string> = []
  assertion.hold((r) => lost.push(r))
  await until(() => fs.existsSync(log) && fs.readFileSync(log, "utf8").trim() !== "")
  expect(fs.readFileSync(log, "utf8").trim()).toBe("-i -w 4242")
  assertion.release()
  await Bun.sleep(100)
  expect([assertion.held(), lost]).toEqual([false, []])

  fs.writeFileSync(bin, "#!/bin/sh\nexit 1\n", { mode: 0o755 })
  assertion.hold((r) => lost.push(r))
  await until(() => lost.length > 0)
  expect(assertion.held()).toBe(false)
  expect(lost).toEqual(["Keep awake stopped unexpectedly (exit 1)"])
})
