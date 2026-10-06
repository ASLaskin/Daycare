// Power service with fake osascript, pmset and blocker.

import { afterAll, describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { PowerConfig, PowerInput } from "../src/main/power/config.ts"
import { Power } from "../src/main/power/Power.ts"
import { PowerBlocker } from "../src/main/power/PowerBlocker.ts"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-power-"))
const log = (name: string) => path.join(root, `${name}.log`)
const sentinel = path.join(root, "lid-release")
const sleep = (ms: number) => Bun.sleep(ms)

const writeBin = (name: string, body: string) => {
  const p = path.join(root, name)
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return p
}

// Fake osascript; its exit code comes from osa-exit
const osascript = writeBin(
  "osascript",
  `printf '%s\\n' "$*" >> "${log("osa")}"\nexit "$(cat "${root}/osa-exit" 2>/dev/null || echo 0)"`,
)
const pmset = writeBin(
  "pmset",
  `printf '%s\\n' "$*" >> "${log("pmset")}"\n` +
    `if [ "$1" = "-g" ]; then echo " SleepDisabled $(cat "${root}/sleep-disabled" 2>/dev/null || echo 0)"; fi\nexit 0`,
)

const config: PowerConfig = { osascript, pmset, sentinel, lidGraceMs: 700, isMac: true }

const started: Array<number> = []
const stopped: Array<number> = []
const FakeBlocker = Layer.succeed(
  PowerBlocker,
  PowerBlocker.of({
    start: () => started.push(started.length + 1),
    stop: (id) => void stopped.push(id),
    isStarted: (id) => started.length >= id && !stopped.includes(id),
  }),
)

const readLog = (name: string) => (fs.existsSync(log(name)) ? fs.readFileSync(log(name), "utf8").trim().split("\n") : [])

const fresh = () => {
  started.length = 0
  stopped.length = 0
  const leftovers = [log("osa"), log("pmset"), ...["osa-exit", "sleep-disabled", "lid-release"].map((f) => path.join(root, f))]
  leftovers.forEach((f) => fs.rmSync(f, { force: true }))
  const runtime = ManagedRuntime.make(Power.layer(config).pipe(Layer.provide(FakeBlocker)))
  const use = <A>(f: (p: Power["Service"]) => Effect.Effect<A>) => runtime.runPromise(Power.use(f))
  return {
    runtime,
    apply: (input: Partial<PowerInput>) =>
      use((p) => p.apply({ mode: "while-running", lidClosed: false, activeCount: 0, busyCount: 0, ...input })),
    status: () => use((p) => p.status),
    restore: () => use((p) => p.restore),
    dismissError: () => use((p) => p.dismissError),
  }
}

// Shell script inside an osascript log line
const shellFromOsaLine = (line: string) => {
  const m = /^-e do shell script "([\s\S]*)" with administrator privileges$/.exec(line.trim())
  expect(m).not.toBeNull()
  return m![1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

test("the blocker follows working sessions, not open ones", async () => {
  const p = fresh()
  await p.apply({ mode: "off", activeCount: 3, busyCount: 3 })
  expect(started.length).toBe(0)
  await p.apply({ activeCount: 0, busyCount: 0 })
  expect(started.length).toBe(0)
  // Idle session holds nothing
  await p.apply({ activeCount: 1, busyCount: 0 })
  expect(started.length).toBe(0)
  await p.apply({ activeCount: 1, busyCount: 1 })
  expect((await p.status()).holding).toBe(true)
  // Second session reuses the assertion
  await p.apply({ activeCount: 2, busyCount: 1 })
  expect(started.length).toBe(1)
  await p.apply({ activeCount: 0, busyCount: 0 })
  expect((await p.status()).holding).toBe(false)
  expect(stopped.length).toBe(1)
  await p.apply({ mode: "always" })
  expect((await p.status()).holding).toBe(true)
  // Quit
  await p.runtime.dispose()
  expect(stopped.length).toBe(2)
})

let watchdogScript = ""

test("the lid escalation asks once, holds through the grace window, then lapses", async () => {
  const p = fresh()
  await p.apply({ activeCount: 1, busyCount: 0, lidClosed: true })
  await sleep(120)
  expect(readLog("osa").length).toBe(0)

  await p.apply({ activeCount: 1, busyCount: 1, lidClosed: true })
  await sleep(500)
  const lines = readLog("osa")
  expect(lines.length).toBe(1)
  expect((await p.status()).lidClosedActive).toBe(true)
  watchdogScript = shellFromOsaLine(lines[0]!)
  expect(watchdogScript).toMatch(/ -a disablesleep 1/)
  expect(watchdogScript).toContain(sentinel)

  await p.apply({ activeCount: 2, busyCount: 2, lidClosed: true })
  await sleep(120)
  expect(readLog("osa").length).toBe(1)

  // Grace window holds, then releases
  await p.apply({ activeCount: 1, busyCount: 0, lidClosed: true })
  await sleep(500)
  expect((await p.status()).lidClosedActive).toBe(true)
  expect(fs.existsSync(sentinel)).toBe(false)
  await sleep(900)
  expect((await p.status()).lidClosedActive).toBe(false)
  expect(fs.existsSync(sentinel)).toBe(true)
  expect(readLog("osa").length).toBe(1)
  await p.runtime.dispose()
})

// Root watchdog reverting disablesleep
describe("the watchdog", () => {
  const sleeper = () => spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"])
  const withPid = (pid: number) => watchdogScript.replace(/'(\d+)'/, `'${pid}'`)
  const reverts = () => readLog("pmset").filter((l) => /disablesleep 0/.test(l)).length

  test(
    "reverts when a running app drops the sentinel",
    async () => {
      fs.rmSync(log("pmset"), { force: true })
      fs.rmSync(sentinel, { force: true })
      const alive = sleeper()
      execFileSync("/bin/sh", ["-c", withPid(alive.pid!)])
      await sleep(300)
      expect(readLog("pmset").filter((l) => /disablesleep 1/.test(l)).length).toBe(1)
      expect(reverts()).toBe(0)
      fs.writeFileSync(sentinel, "go")
      await sleep(3500)
      expect(reverts()).toBe(1)
      expect(fs.existsSync(sentinel)).toBe(false)
      alive.kill("SIGKILL")
    },
    { timeout: 8000 },
  )

  test(
    "reverts when the app is killed, so SIGKILL cannot strand the Mac",
    async () => {
      fs.rmSync(log("pmset"), { force: true })
      const doomed = sleeper()
      execFileSync("/bin/sh", ["-c", withPid(doomed.pid!)])
      await sleep(300)
      doomed.kill("SIGKILL")
      await sleep(3500)
      expect(reverts()).toBe(1)
    },
    { timeout: 8000 },
  )
})

test("a cancelled dialog is reported, not retried, and cleared only when dismissed", async () => {
  const p = fresh()
  fs.writeFileSync(path.join(root, "osa-exit"), "1")
  await p.apply({ activeCount: 1, busyCount: 1, lidClosed: true })
  await sleep(200)
  expect((await p.status()).lidClosedActive).toBe(false)
  expect((await p.status()).error).not.toBeNull()
  await p.apply({ activeCount: 1, busyCount: 1, lidClosed: true })
  await sleep(500)
  expect(readLog("osa").length).toBe(1)
  expect((await p.status()).error).not.toBeNull()
  expect((await p.dismissError()).error).toBeNull()
  await p.runtime.dispose()
})

test(
  "a disablesleep left over from a power loss is detected, and restore clears it",
  async () => {
    const p = fresh()
    fs.writeFileSync(path.join(root, "sleep-disabled"), "1")
    await p.status()
    await sleep(250)
    // Not stale yet during the watchdog window
    expect((await p.status()).stale).toBe(false)
    await sleep(6200)
    expect((await p.status()).stale).toBe(true)
    expect((await p.status()).error).not.toBeNull()
    const after = await p.restore()
    expect(readLog("osa").filter((l) => /disablesleep 0/.test(l)).length).toBe(1)
    expect([after.stale, after.error]).toEqual([false, null])
    await p.runtime.dispose()
  },
  { timeout: 10000 },
)

test("quitting drops the sentinel synchronously and releases the assertion", async () => {
  const p = fresh()
  await p.apply({ activeCount: 1, busyCount: 1, lidClosed: true })
  await sleep(200)
  expect((await p.status()).lidClosedActive).toBe(true)
  await p.runtime.dispose()
  expect(fs.existsSync(sentinel)).toBe(true)
  expect(stopped.length).toBe(1)
})
