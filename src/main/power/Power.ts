// Lid closed needs pmset; a root watchdog reverts it.

import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"
import { execFile } from "node:child_process"
import fs from "node:fs"
import type { PowerStatus } from "../../shared/power.ts"
import type { KeepAwake } from "../../shared/settings.ts"

const AUTH_TIMEOUT_MS = 120000
const WATCHDOG_POLL_S = 2

export class PowerBlocker extends Context.Service<
  PowerBlocker,
  {
    readonly start: () => number
    readonly stop: (id: number) => void
    readonly isStarted: (id: number) => boolean
  }
>()("daycare/PowerBlocker") {}

export interface PowerConfig {
  readonly osascript: string
  readonly pmset: string
  // Its appearance tells the watchdog to revert.
  readonly sentinel: string
  // Follows work, not the window; long grace.
  readonly lidGraceMs: number
  readonly isMac: boolean
}

export const defaultPowerConfig = (sentinel: string): PowerConfig => ({
  osascript: "/usr/bin/osascript",
  pmset: "/usr/bin/pmset",
  sentinel,
  lidGraceMs: 600000,
  isMac: process.platform === "darwin",
})

export interface PowerInput {
  readonly mode: KeepAwake
  readonly lidClosed: boolean
  readonly activeCount: number
  readonly busyCount: number
}

const shellQuote = (value: string | number) => `'${String(value).split("'").join(`'\\''`)}'`

const osaArgs = (shellCommand: string) => {
  const escaped = shellCommand.split("\\").join("\\\\").split('"').join('\\"')
  return ["-e", `do shell script "${escaped}" with administrator privileges`]
}

class KeepAwakeMachine {
  private mode: KeepAwake = "off"
  private activeCount = 0
  private busyCount = 0
  private lidClosed = false
  private blockerId: number | null = null
  private lidOn = false // we turned disablesleep on
  private busy = false // privileged call in flight
  private lidFailed = false // never re-prompt after failure
  private error: string | null = null
  private stale = false // on at launch, not ours
  private lastBusyAt = 0
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private lastKey = ""

  constructor(
    private readonly config: PowerConfig,
    private readonly blocker: PowerBlocker["Service"],
    private readonly onChange: (status: PowerStatus) => void,
  ) {}

  status(): PowerStatus {
    return {
      mode: this.mode,
      holding: this.holding(),
      activeCount: this.activeCount,
      busyCount: this.busyCount,
      lidClosed: this.lidClosed,
      lidClosedActive: this.lidOn,
      stale: this.stale,
      error: this.error,
    }
  }

  init() {
    this.clearSentinel()
    // Let a previous watchdog finish reverting.
    setTimeout(() => this.detectStale(), WATCHDOG_POLL_S * 3000).unref()
    this.publish()
  }

  apply(next: PowerInput) {
    try {
      this.mode = next.mode
      this.activeCount = Math.max(0, next.activeCount)
      this.busyCount = Math.max(0, next.busyCount)
      this.lidClosed = next.lidClosed
      if (this.busyCount > 0) this.lastBusyAt = Date.now()
      this.syncBlocker()
      this.reconcileLid()
      this.scheduleGrace()
    } catch (err) {
      this.error = `Keep awake failed: ${err instanceof Error ? err.message : String(err)}`
    }
    this.publish()
  }

  // Stale escape hatch; nothing to watch.
  restore(done: (status: PowerStatus) => void) {
    if (!this.config.isMac || this.busy) return done(this.status())
    this.busy = true
    this.dropSentinel(false)
    execFile(this.config.osascript, osaArgs(`${this.config.pmset} -a disablesleep 0`), { timeout: AUTH_TIMEOUT_MS }, (err) => {
      this.busy = false
      if (err) {
        this.error = "Could not restore normal sleep, run: sudo pmset -a disablesleep 0"
      } else {
        this.lidOn = false
        this.stale = false
        this.error = null
        this.clearSentinel()
      }
      this.publish()
      done(this.status())
    })
  }

  dismissError() {
    this.error = null
    this.publish()
  }

  // Sync, safe from an exit handler.
  release() {
    try {
      this.mode = "off"
      if (this.holding()) this.blocker.stop(this.blockerId!)
      this.blockerId = null
      if (this.graceTimer) clearTimeout(this.graceTimer)
      this.graceTimer = null
    } catch {}
    if (this.lidOn) {
      this.lidOn = false
      this.dropSentinel(true)
    }
    this.publish()
  }

  dropSentinelNow() {
    this.dropSentinel(true)
  }

  private holding() {
    try {
      return this.blockerId !== null && this.blocker.isStarted(this.blockerId)
    } catch {
      return false
    }
  }

  private wantBlocker() {
    return this.mode === "always" || (this.mode === "while-running" && this.busyCount > 0)
  }

  private lidWorkWanted() {
    if (this.mode === "always" || this.busyCount > 0) return true
    return this.lastBusyAt > 0 && Date.now() - this.lastBusyAt < this.config.lidGraceMs
  }

  private wantLid() {
    return this.config.isMac && this.lidClosed && this.mode !== "off" && this.lidWorkWanted()
  }

  private publish() {
    const s = this.status()
    const key = JSON.stringify(s)
    if (key === this.lastKey) return
    this.lastKey = key
    this.onChange(s)
  }

  // Sentinel avoids a second password prompt.
  private enableArgs() {
    const { pmset, sentinel } = this.config
    const watch =
      `/usr/bin/nohup /bin/sh -c 'while /bin/kill -0 "$1" 2>/dev/null && [ ! -f "$2" ]; do /bin/sleep ${WATCHDOG_POLL_S}; done; ` +
      `${pmset} -a disablesleep 0; /bin/rm -f "$2"' daycare ${shellQuote(process.pid)} ${shellQuote(sentinel)} >/dev/null 2>&1 &`
    return osaArgs(`${pmset} -a disablesleep 1; ${watch}`)
  }

  private dropSentinel(sync: boolean) {
    try {
      if (sync) fs.writeFileSync(this.config.sentinel, String(Date.now()))
      else fs.writeFile(this.config.sentinel, String(Date.now()), () => {})
    } catch {}
  }

  private clearSentinel() {
    try {
      fs.rmSync(this.config.sentinel, { force: true })
    } catch {}
  }

  private syncBlocker() {
    const held = this.holding()
    if (this.wantBlocker() && !held) {
      this.blockerId = this.blocker.start()
    } else if (!this.wantBlocker() && this.blockerId !== null) {
      if (held) this.blocker.stop(this.blockerId)
      this.blockerId = null
    }
  }

  // Only turning on prompts; off is a file.
  private reconcileLid() {
    if (this.busy) return
    const want = this.wantLid()
    if (!want) this.lidFailed = false
    if (want && this.lidOn) return

    if (!want && this.lidOn) {
      this.lidOn = false
      this.dropSentinel(false)
      this.publish()
      return
    }
    if (!want || this.lidFailed) return

    this.busy = true
    // Clear the sentinel before a fresh watchdog.
    this.clearSentinel()
    execFile(this.config.osascript, this.enableArgs(), { timeout: AUTH_TIMEOUT_MS }, (err) => {
      this.busy = false
      if (err) {
        this.lidFailed = true
        this.error = "Keep awake with lid closed was cancelled or failed"
      } else {
        this.lidOn = true
        this.stale = false
        this.error = null
      }
      this.publish()
      if (!err) this.reconcileLid()
    })
  }

  private scheduleGrace() {
    if (this.graceTimer) clearTimeout(this.graceTimer)
    this.graceTimer = null
    if (!this.lidOn || this.busyCount > 0 || this.mode === "always") return
    const left = this.config.lidGraceMs - (Date.now() - this.lastBusyAt)
    this.graceTimer = setTimeout(
      () => {
        this.graceTimer = null
        this.reconcileLid()
        this.publish()
      },
      Math.max(1000, left),
    )
    this.graceTimer.unref()
  }

  // Power loss is the unhookable exit.
  private detectStale() {
    if (!this.config.isMac) return
    execFile(this.config.pmset, ["-g"], { timeout: 10000 }, (err, stdout) => {
      if (err || this.lidOn || this.busy) return
      if (!/SleepDisabled\s+1/.test(String(stdout))) return
      this.stale = true
      this.error ??= "This Mac is still set not to sleep from an earlier run"
      this.publish()
    })
  }
}

// ---------- service ----------

export interface PowerShape {
  readonly status: Effect.Effect<PowerStatus>
  readonly changes: Effect.Effect<Stream.Stream<PowerStatus>, never, Scope.Scope>
  readonly apply: (input: PowerInput) => Effect.Effect<void>
  readonly restore: Effect.Effect<PowerStatus>
  readonly dismissError: Effect.Effect<PowerStatus>
}

const make = (config: PowerConfig) =>
  Effect.gen(function* () {
    const blocker = yield* PowerBlocker
    const pubsub = yield* PubSub.sliding<PowerStatus>(16)
    const machine = new KeepAwakeMachine(config, blocker, (s) => PubSub.publishUnsafe(pubsub, s))

    // Exit handlers also cover JS crashes.
    const onExit = () => machine.dropSentinelNow()
    process.on("exit", onExit)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        machine.release()
        process.off("exit", onExit)
      }),
    )
    machine.init()

    return Power.of({
      status: Effect.sync(() => machine.status()),
      changes: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      apply: (input) => Effect.sync(() => machine.apply(input)),
      restore: Effect.callback<PowerStatus>((resume) => machine.restore((s) => resume(Effect.succeed(s)))),
      dismissError: Effect.sync(() => {
        machine.dismissError()
        return machine.status()
      }),
    })
  })

export class Power extends Context.Service<Power, PowerShape>()("daycare/Power") {
  static readonly layer = (config: PowerConfig) => Layer.effect(Power, make(config))
}
