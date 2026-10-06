// Rate limited, so no polling timer.

import { Clock, Context, Duration, Effect, Layer, PubSub, Ref, Schema, Scope, Semaphore, Stream } from "effect"
import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { Usage as UsageData, UsageLimit } from "../../shared/usage.ts"
import { AppPaths } from "../AppPaths.ts"
import { normalizeUsage, retryAfterMs } from "./normalize.ts"

const MIN_GAP = Duration.minutes(3)
const MANUAL_GAP = Duration.seconds(10)
const BACKOFF = Duration.minutes(5)
const MAX_BACKOFF = Duration.hours(1)

// ---------- errors ----------

export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", { retryAfterMs: Schema.Number }) {}
export class UsageUnavailable extends Schema.TaggedError<UsageUnavailable>()("UsageUnavailable", { reason: Schema.String }) {}

// ---------- the network call ----------

export class UsageSource extends Context.Service<
  UsageSource,
  { readonly fetch: Effect.Effect<ReadonlyArray<UsageLimit>, RateLimited | UsageUnavailable> }
>()("daycare/UsageSource") {
  static readonly layer = Layer.effect(
    UsageSource,
    Effect.gen(function* () {
      const { home } = yield* AppPaths
      return UsageSource.of({ fetch: fetchUsage(home) })
    }),
  )
}

const tokenFromJson = (raw: string): string | null => {
  try {
    return JSON.parse(raw).claudeAiOauth?.accessToken ?? null
  } catch {
    return null
  }
}

// Keychain on a Mac, else the file.
const oauthToken = (home: string) =>
  Effect.callback<string | null>((resume) => {
    const fromFile = () => {
      try {
        resume(Effect.succeed(tokenFromJson(fs.readFileSync(path.join(home, ".claude", ".credentials.json"), "utf8"))))
      } catch {
        resume(Effect.succeed(null))
      }
    }
    if (process.platform !== "darwin") return fromFile()
    execFile("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], (err, out) => {
      const token = err ? null : tokenFromJson(out)
      if (token) resume(Effect.succeed(token))
      else fromFile()
    })
  })

const fetchUsage = (home: string) =>
  Effect.gen(function* () {
    const token = yield* oauthToken(home)
    if (!token) return yield* new UsageUnavailable({ reason: "Not signed in to Claude Code" })
    const res = yield* Effect.tryPromise({
      try: (signal) =>
        fetch("https://api.anthropic.com/api/oauth/usage", {
          headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "content-type": "application/json" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        }),
      catch: (err) => new UsageUnavailable({ reason: String(err) }),
    })
    if (res.status === 429) return yield* new RateLimited({ retryAfterMs: retryAfterMs(res.headers.get("retry-after"), Date.now()) })
    if (res.status === 401) return yield* new UsageUnavailable({ reason: "Token expired, run claude once to refresh" })
    if (!res.ok) return yield* new UsageUnavailable({ reason: `Usage request failed (${res.status})` })
    const body = yield* Effect.tryPromise({ try: () => res.json(), catch: () => new UsageUnavailable({ reason: "Bad usage response" }) })
    return normalizeUsage(body)
  })

// ---------- pacing ----------

// Decoded, since it is read from disk.
const SavedUsage = Schema.Struct({
  limits: Schema.Array(
    Schema.Struct({ kind: Schema.String, label: Schema.String, percent: Schema.Number, resetsAt: Schema.NullOr(Schema.String) }),
  ),
  fetchedAt: Schema.Number,
  blockedUntil: Schema.optionalKey(Schema.Number),
})

interface Pacing {
  readonly usage: UsageData
  readonly lastAttempt: number
  readonly blockedUntil: number
  readonly backoffMs: number
  readonly scheduled: boolean // coalesces bursts of finished turns
}

export interface UsageShape {
  readonly get: Effect.Effect<UsageData>
  // Auto waits MIN_GAP, manual MANUAL_GAP; 429 blocks both.
  readonly refresh: (options?: { readonly manual?: boolean }) => Effect.Effect<UsageData>
  readonly changes: Effect.Effect<Stream.Stream<UsageData>, never, Scope.Scope>
}

export class Usage extends Context.Service<Usage, UsageShape>()("daycare/Usage") {
  static readonly layer = Layer.effect(
    Usage,
    Effect.gen(function* () {
      const source = yield* UsageSource
      const { userData } = yield* AppPaths
      const file = path.join(userData, "usage.json")
      // Stops with the service's scope.
      const scope = yield* Effect.scope

      const saved = yield* Effect.sync(() => {
        try {
          return Schema.decodeUnknownSync(SavedUsage)(JSON.parse(fs.readFileSync(file, "utf8")))
        } catch {
          return null
        }
      })
      const pacing = yield* Ref.make<Pacing>({
        usage: { limits: saved?.limits ?? [], fetchedAt: saved?.fetchedAt ?? 0 },
        lastAttempt: saved?.fetchedAt ?? 0,
        blockedUntil: saved?.blockedUntil ?? 0,
        backoffMs: 0,
        scheduled: false,
      })
      const pubsub = yield* PubSub.unbounded<UsageData>()
      // Waiters see the fresh numbers.
      const lock = yield* Semaphore.make(1)

      const save = (p: Pacing) =>
        Effect.sync(() => {
          try {
            fs.writeFileSync(file, JSON.stringify({ limits: p.usage.limits, fetchedAt: p.usage.fetchedAt, blockedUntil: p.blockedUntil }))
          } catch {}
        })

      const attempt = Effect.gen(function* () {
        const result = yield* source.fetch.pipe(
          Effect.map((limits) => ({ ok: true as const, limits })),
          // Failures keep the last good numbers.
          Effect.catchTag("RateLimited", (e) => Effect.succeed({ ok: false as const, retryAfterMs: e.retryAfterMs })),
          Effect.catchTag("UsageUnavailable", () => Effect.succeed({ ok: false as const, retryAfterMs: null })),
        )
        const now = yield* Clock.currentTimeMillis
        const next = yield* Ref.updateAndGet(pacing, (p): Pacing => {
          if (result.ok) return { ...p, usage: { limits: result.limits, fetchedAt: now }, backoffMs: 0, blockedUntil: 0 }
          if (result.retryAfterMs === null) return p
          const backoffMs = Math.min(p.backoffMs ? p.backoffMs * 2 : Duration.toMillis(BACKOFF), Duration.toMillis(MAX_BACKOFF))
          return { ...p, backoffMs, blockedUntil: now + Math.max(result.retryAfterMs, backoffMs) }
        })
        yield* save(next)
        yield* PubSub.publish(pubsub, next.usage)
        return next.usage
      })

      const refresh: UsageShape["refresh"] = (options) =>
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
                // Skipped if a manual refresh ran.
                const wake = Effect.gen(function* () {
                  const q = yield* Ref.getAndUpdate(pacing, (q) => ({ ...q, scheduled: false }))
                  if (q.lastAttempt === p.lastAttempt) yield* refresh()
                })
                yield* Effect.sleep(due - now).pipe(Effect.andThen(wake), Effect.forkIn(scope))
              }
              return p.usage
            }
            yield* Ref.update(pacing, (q) => ({ ...q, lastAttempt: now }))
            return yield* attempt
          }),
        )

      return Usage.of({
        get: Ref.get(pacing).pipe(Effect.map((p) => p.usage)),
        refresh,
        changes: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      })
    }),
  )
}
