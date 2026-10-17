// Plan usage for the active account.

import { Context, Effect, Layer, PubSub, Scope, Semaphore, Stream } from "effect"
import { activeAccountOf } from "../../shared/accounts.ts"
import type { AccountId } from "../../shared/ids.ts"
import type { Settings } from "../../shared/settings.ts"
import type { Usage as UsageData } from "../../shared/usage.ts"
import { AppPaths } from "../AppPaths.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { makeTracker, type RefreshOptions, type Tracker, usageFile } from "./tracker.ts"
import { UsageSource } from "./UsageSource.ts"

export interface UsageShape {
  readonly get: Effect.Effect<UsageData>
  // Fetches now or schedules one, respecting gaps and backoff.
  readonly refresh: (options?: RefreshOptions) => Effect.Effect<UsageData>
  readonly changes: Effect.Effect<Stream.Stream<UsageData>, never, Scope.Scope>
}

export class Usage extends Context.Service<Usage, UsageShape>()("daycare/Usage") {
  static readonly layer = Layer.effect(
    Usage,
    Effect.gen(function* () {
      const source = yield* UsageSource
      const settings = yield* SettingsStore
      const { userData } = yield* AppPaths
      const scope = yield* Effect.scope
      const pubsub = yield* PubSub.unbounded<UsageData>()
      const trackers = new Map<AccountId, Tracker>()
      const lock = yield* Semaphore.make(1)

      const active = settings.get.pipe(Effect.map(activeAccountOf))

      // Only the active account's numbers reach the window
      const publish = (account: AccountId) => (usage: UsageData) =>
        Effect.gen(function* () {
          if ((yield* active) === account) {
            yield* PubSub.publish(pubsub, usage)
          }
        })

      const trackerFor = (account: AccountId) =>
        Semaphore.withPermit(
          lock,
          Effect.gen(function* () {
            const known = trackers.get(account)
            if (known) {
              return known
            }
            const made = yield* makeTracker({ file: usageFile(userData, account), fetch: source.fetch(account), publish: publish(account), scope })
            trackers.set(account, made)
            return made
          }),
        )

      const activeTracker = Effect.flatMap(active, trackerFor)

      const accountSwitches = (changes: Stream.Stream<Settings>, initial: AccountId) =>
        Stream.concat(Stream.succeed(initial), Stream.map(changes, activeAccountOf)).pipe(Stream.changes, Stream.drop(1))

      // Switching shows the cached numbers, then refreshes
      const initial = yield* active
      yield* settings.changes.pipe(
        Effect.flatMap((changes) =>
          Stream.runForEach(accountSwitches(changes, initial), (account) =>
            Effect.gen(function* () {
              const tracker = yield* trackerFor(account)
              yield* PubSub.publish(pubsub, yield* tracker.get)
              yield* Effect.forkIn(tracker.refresh(), scope)
            }),
          ),
        ),
        Effect.forkScoped,
      )

      return Usage.of({
        get: Effect.flatMap(activeTracker, (t) => t.get),
        refresh: (options) => Effect.flatMap(activeTracker, (t) => t.refresh(options)),
        changes: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      })
    }),
  )
}
