// Paced usage fetching for one account, cached on disk.

import { Clock, Duration, Effect, Ref, Schema, type Scope, Semaphore } from "effect"
import fs from "node:fs"
import path from "node:path"
import { DEFAULT_ACCOUNT } from "../../shared/accounts.ts"
import type { AccountId } from "../../shared/ids.ts"
import type { Usage, UsageLimit } from "../../shared/usage.ts"
import type { RateLimited, UsageUnavailable } from "./errors.ts"

const MIN_GAP = Duration.minutes(3)
const MANUAL_GAP = Duration.seconds(10)
const BACKOFF = Duration.minutes(5)
const MAX_BACKOFF = Duration.hours(1)

// Last usage saved to disk.
const SavedUsage = Schema.Struct({
  limits: Schema.Array(
    Schema.Struct({
      kind: Schema.String,
      label: Schema.String,
      percent: Schema.Number,
      resetsAt: Schema.NullOr(Schema.String),
    }),
  ),
  fetchedAt: Schema.Number,
  blockedUntil: Schema.optionalKey(Schema.Number),
})

interface Pacing {
  readonly usage: Usage
  readonly lastAttempt: number
  readonly blockedUntil: number
  readonly backoffMs: number
  // A deferred refresh is already pending.
  readonly scheduled: boolean
}

export interface RefreshOptions {
  readonly manual?: boolean
}

export interface Tracker {
  readonly get: Effect.Effect<Usage>
  // Fetches now or schedules one, respecting gaps and backoff.
  readonly refresh: (options?: RefreshOptions) => Effect.Effect<Usage>
}

// Default keeps the file name older builds used
export const usageFile = (userData: string, account: AccountId) =>
  path.join(userData, account === DEFAULT_ACCOUNT ? "usage.json" : `usage-${account.replace(/[^\w-]/g, "")}.json`)

const readSaved = (file: string) => {
  try {
    return Schema.decodeUnknownSync(Schema.fromJsonString(SavedUsage))(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

const save = (file: string, p: Pacing) =>
  Effect.sync(() => {
    try {
      fs.writeFileSync(file, JSON.stringify({ limits: p.usage.limits, fetchedAt: p.usage.fetchedAt, blockedUntil: p.blockedUntil }))
    } catch {}
  })

export const makeTracker = (options: {
  readonly file: string
  readonly fetch: Effect.Effect<ReadonlyArray<UsageLimit>, RateLimited | UsageUnavailable>
  readonly publish: (usage: Usage) => Effect.Effect<void>
  readonly scope: Scope.Scope
}) =>
  Effect.gen(function* () {
    const { file, fetch, publish, scope } = options
    const saved = yield* Effect.sync(() => readSaved(file))
    const pacing = yield* Ref.make<Pacing>({
      usage: { limits: saved?.limits ?? [], fetchedAt: saved?.fetchedAt ?? 0 },
      lastAttempt: saved?.fetchedAt ?? 0,
      blockedUntil: saved?.blockedUntil ?? 0,
      backoffMs: 0,
      scheduled: false,
    })
    const lock = yield* Semaphore.make(1)

    const attempt = Effect.gen(function* () {
      const result = yield* fetch.pipe(
        Effect.map((limits) => ({ ok: true as const, limits })),
        Effect.catchTag("RateLimited", (e) => Effect.succeed({ ok: false as const, retryAfterMs: e.retryAfterMs })),
        Effect.catchTag("UsageUnavailable", () => Effect.succeed({ ok: false as const, retryAfterMs: null })),
      )
      const now = yield* Clock.currentTimeMillis
      const next = yield* Ref.updateAndGet(pacing, (p): Pacing => {
        if (result.ok) {
          return { ...p, usage: { limits: result.limits, fetchedAt: now }, backoffMs: 0, blockedUntil: 0 }
        }
        if (result.retryAfterMs === null) {
          return p
        }
        const backoffMs = Math.min(p.backoffMs ? p.backoffMs * 2 : Duration.toMillis(BACKOFF), Duration.toMillis(MAX_BACKOFF))
        return { ...p, backoffMs, blockedUntil: now + Math.max(result.retryAfterMs, backoffMs) }
      })
      yield* save(file, next)
      yield* publish(next.usage)
      return next.usage
    })

    const refresh = (options?: RefreshOptions): Effect.Effect<Usage> =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const p = yield* Ref.get(pacing)
          const gap = Duration.toMillis(options?.manual ? MANUAL_GAP : MIN_GAP)
          const due = Math.max(p.blockedUntil, p.lastAttempt + gap)
          if (now < due) {
            if (!p.scheduled) {
              yield* Ref.update(pacing, (q) => ({ ...q, scheduled: true }))
              // Deferred refresh unless another attempt ran.
              const wake = Effect.gen(function* () {
                const q = yield* Ref.getAndUpdate(pacing, (q) => ({ ...q, scheduled: false }))
                if (q.lastAttempt === p.lastAttempt) {
                  yield* refresh()
                }
              })
              yield* Effect.sleep(due - now).pipe(Effect.andThen(wake), Effect.forkIn(scope))
            }
            return p.usage
          }
          yield* Ref.update(pacing, (q) => ({ ...q, lastAttempt: now }))
          return yield* attempt
        }),
      )

    return { get: Ref.get(pacing).pipe(Effect.map((p) => p.usage)), refresh } satisfies Tracker
  })
