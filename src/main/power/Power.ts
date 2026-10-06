// Keep awake service over KeepAwakeMachine.

import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"
import type { PowerStatus } from "../../shared/power.ts"
import type { PowerConfig, PowerInput } from "./config.ts"
import { KeepAwakeMachine } from "./KeepAwakeMachine.ts"
import { PowerBlocker } from "./PowerBlocker.ts"

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

    // Reverts lid close on any process exit, crashes included.
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
