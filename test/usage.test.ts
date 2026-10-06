// Usage pacing rules under TestClock.

import { describe, expect, test } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AppPaths } from "../src/main/AppPaths.ts"
import { Usage } from "../src/main/usage/Usage.ts"
import { UsageSource } from "../src/main/usage/UsageSource.ts"
import { RateLimited, UsageUnavailable } from "../src/main/usage/errors.ts"
import { normalizeUsage, retryAfterMs } from "../src/main/usage/normalize.ts"
import { asDirPath } from "../src/shared/ids.ts"
import type { UsageLimit } from "../src/shared/usage.ts"

const limit = (percent: number): UsageLimit => ({ kind: "session", label: "Session", percent, resetsAt: null })

type Reply = "ok" | "rate-limited" | "down"

// Fake source answering replies in order, counting calls
const withUsage = <A>(replies: Array<Reply>, body: (calls: Ref.Ref<number>) => Effect.Effect<A, never, Usage>) =>
  Effect.gen(function* () {
    // Start the clock at a real date
    yield* TestClock.setTime(Date.UTC(2026, 0, 1))
    const calls = yield* Ref.make(0)
    const source = Layer.succeed(
      UsageSource,
      UsageSource.of({
        fetch: Effect.gen(function* () {
          const n = yield* Ref.getAndUpdate(calls, (c) => c + 1)
          const reply = replies[n] ?? "ok"
          if (reply === "rate-limited") {
            return yield* new RateLimited({ retryAfterMs: 0 })
          }
          if (reply === "down") {
            return yield* new UsageUnavailable({ reason: "down" })
          }
          return [limit(n + 1)]
        }),
      }),
    )
    const userData = asDirPath(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-usage-")))
    const paths = Layer.succeed(AppPaths, AppPaths.of({ userData, appRoot: userData, home: userData }))
    return yield* body(calls).pipe(Effect.provide(Usage.layer.pipe(Layer.provide([source, paths]))))
  }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise)

const refresh = (manual = false) => Usage.use((u) => u.refresh({ manual }))

describe("Usage pacing", () => {
  test("the first refresh fetches, a second one inside the gap does not", () =>
    withUsage([], (calls) =>
      Effect.gen(function* () {
        expect((yield* refresh()).limits[0]!.percent).toBe(1)
        yield* refresh()
        expect(yield* Ref.get(calls)).toBe(1)
      }),
    ))

  test("a refresh inside the gap defers one fetch to the end of it, coalescing bursts", () =>
    withUsage([], (calls) =>
      Effect.gen(function* () {
        yield* refresh()
        yield* refresh()
        yield* refresh()
        yield* TestClock.adjust("2 minutes")
        expect(yield* Ref.get(calls)).toBe(1)
        yield* TestClock.adjust("1 minute")
        expect(yield* Ref.get(calls)).toBe(2)
      }),
    ))

  test("a manual refresh only waits ten seconds, and cancels the deferred one", () =>
    withUsage([], (calls) =>
      Effect.gen(function* () {
        yield* refresh()
        // Schedules the auto fetch for minute 3
        yield* refresh()
        yield* TestClock.adjust("11 seconds")
        yield* refresh(true)
        expect(yield* Ref.get(calls)).toBe(2)
        yield* TestClock.adjust("3 minutes")
        expect(yield* Ref.get(calls)).toBe(2)
      }),
    ))

  test("a 429 blocks even manual refreshes for the backoff, and keeps the old numbers", () =>
    withUsage(["ok", "rate-limited"], (calls) =>
      Effect.gen(function* () {
        yield* refresh(true)
        yield* TestClock.adjust("11 seconds")
        expect((yield* refresh(true)).limits[0]!.percent).toBe(1)
        yield* TestClock.adjust("1 minute")
        yield* refresh(true)
        expect(yield* Ref.get(calls)).toBe(2)
        // Deferred fetch after the backoff
        yield* TestClock.adjust("5 minutes")
        expect(yield* Ref.get(calls)).toBe(3)
      }),
    ))

  test("any other failure is silent and keeps the last good numbers", () =>
    withUsage(["ok", "down"], () =>
      Effect.gen(function* () {
        yield* refresh(true)
        yield* TestClock.adjust("11 seconds")
        const after = yield* refresh(true)
        expect(after.limits[0]!.percent).toBe(1)
      }),
    ))
})

describe("normalizeUsage", () => {
  test("reads the limits array", () => {
    expect(normalizeUsage({ limits: [{ kind: "weekly_opus", percent: "12.5", resets_at: "x" }, { kind: "odd_one", percent: 3 }] })).toEqual([
      { kind: "weekly_opus", label: "Week, Opus", percent: 12.5, resetsAt: "x" },
      { kind: "odd_one", label: "odd one", percent: 3, resetsAt: null },
    ])
  })

  test("falls back to the per-window keys", () => {
    expect(normalizeUsage({ five_hour: { utilization: 40, resets_at: "r" }, seven_day: { utilization: 7 } })).toEqual([
      { kind: "session", label: "Session", percent: 40, resetsAt: "r" },
      { kind: "weekly_all", label: "Week", percent: 7, resetsAt: null },
    ])
  })
})

test("Retry-After is seconds or an HTTP date", () => {
  expect(retryAfterMs("30", 0)).toBe(30000)
  expect(retryAfterMs(new Date(5000).toUTCString(), 0)).toBe(5000)
  expect(retryAfterMs(null, 0)).toBe(0)
  expect(retryAfterMs("soon", 0)).toBe(0)
})
