// Coordinator keep awake view plus the desktop lid machine.

import { Context, Effect, PubSub, type Scope, Stream } from "effect"
import fs from "node:fs"
import type { Command } from "../../shared/coordinator.ts"
import type { Json } from "../../shared/json.ts"
import type { LidClosed, PowerState, PowerStatus } from "../../shared/power.ts"
import type { KeepAwake } from "../../shared/settings.ts"
import type { SettingsStore } from "../settings/SettingsStore.ts"
import type { PowerConfig } from "./config.ts"
import { legacyKeepAwake } from "./legacy.ts"
import { LidMachine } from "./LidMachine.ts"

export interface PowerShape {
  readonly status: Effect.Effect<PowerStatus>
  readonly changes: Effect.Effect<Stream.Stream<PowerStatus>, never, Scope.Scope>
  readonly setMode: (mode: KeepAwake) => Effect.Effect<void>
  readonly restore: Effect.Effect<PowerStatus>
  readonly dismissError: Effect.Effect<PowerStatus>
}

export class Power extends Context.Service<Power, PowerShape>()("daycare/Power") {}

export interface PowerDeps {
  readonly config: PowerConfig
  readonly settings: SettingsStore["Service"]
  readonly request: (command: Command) => Promise<Json>
  // settings.json, read once for the mode it used to hold
  readonly settingsFile: string
}

const sameLid = (a: LidClosed | null, b: LidClosed) => a !== null && a.enabled === b.enabled && a.active === b.active

// Service plus the hooks the coordinator connection drives
export const makePower = (deps: PowerDeps) =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.sliding<PowerStatus>(16)
    let remote: PowerState | null = null
    let lidClosed = (yield* deps.settings.get).keepAwakeLidClosed
    // Last lid state the coordinator acknowledged
    let reported: LidClosed | null = null

    const status = (): PowerStatus => {
      const lid = machine.status()
      return { power: remote, lidClosedActive: lid.active, stale: lid.stale, error: lid.error }
    }

    const publish = () => PubSub.publishUnsafe(pubsub, status())

    // Dropped while disconnected; the next connect reports again
    const report = () => {
      const { enabled, active } = machine.status()
      const lid = { enabled, active }
      if (!remote || sameLid(reported, lid)) {
        return
      }
      deps.request({ method: "lid", lid }).then(
        () => {
          reported = lid
        },
        () => {},
      )
    }

    const machine = new LidMachine(deps.config, () => {
      publish()
      report()
    })

    const reapply = () => machine.apply({ mode: remote?.mode ?? "off", busyCount: remote?.busyCount ?? 0, lidClosed })

    // Reverts lid close on any process exit, crashes included
    const onExit = () => machine.dropSentinelNow()
    process.on("exit", onExit)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        machine.release()
        process.off("exit", onExit)
      }),
    )
    machine.init()

    yield* deps.settings.changes.pipe(
      Effect.flatMap((changes) =>
        Stream.runForEach(changes, (s) =>
          Effect.sync(() => {
            if (s.keepAwakeLidClosed !== lidClosed) {
              lidClosed = s.keepAwakeLidClosed
              reapply()
            }
          }),
        ),
      ),
      Effect.forkScoped,
    )

    const service = Power.of({
      status: Effect.sync(status),
      changes: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      setMode: (mode) => Effect.promise(() => deps.request({ method: "power", mode })).pipe(Effect.asVoid),
      restore: Effect.callback<PowerStatus>((resume) => machine.restore(() => resume(Effect.succeed(status())))),
      dismissError: Effect.sync(() => {
        machine.dismissError()
        return status()
      }),
    })

    return {
      service,
      // Coordinator state from a snapshot or power event
      onState: (state: PowerState) => {
        remote = state
        reapply()
        publish()
        report()
      },
      // Pushes the mode settings.json held before the coordinator owned it
      onConnect: () => {
        reported = null
        const legacy = legacyKeepAwake(() => fs.readFileSync(deps.settingsFile, "utf8"))
        if (legacy) {
          deps.request({ method: "power", mode: legacy, initial: true }).catch(() => {})
        }
      },
      onDisconnect: () => {
        remote = null
        publish()
      },
    }
  })
