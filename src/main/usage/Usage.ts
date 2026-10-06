import {
  Clock,
  Context,
  Duration,
  Effect,
  Layer,
  PubSub,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import fs from "node:fs";
import path from "node:path";
import type { Usage as UsageData } from "../../shared/usage.ts";
import { AppPaths } from "../AppPaths.ts";
import { UsageSource } from "./UsageSource.ts";

const MIN_GAP = Duration.minutes(3);
const MANUAL_GAP = Duration.seconds(10);
const BACKOFF = Duration.minutes(5);
const MAX_BACKOFF = Duration.hours(1);

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
});

interface Pacing {
  readonly usage: UsageData;
  readonly lastAttempt: number;
  readonly blockedUntil: number;
  readonly backoffMs: number;
  // A deferred refresh is already pending.
  readonly scheduled: boolean;
}

export interface UsageShape {
  readonly get: Effect.Effect<UsageData>;
  // Fetches now or schedules one, respecting gaps and backoff.
  readonly refresh: (options?: {
    readonly manual?: boolean;
  }) => Effect.Effect<UsageData>;
  readonly changes: Effect.Effect<Stream.Stream<UsageData>, never, Scope.Scope>;
}

export class Usage extends Context.Service<Usage, UsageShape>()(
  "daycare/Usage",
) {
  static readonly layer = Layer.effect(
    Usage,
    Effect.gen(function* () {
      const source = yield* UsageSource;
      const { userData } = yield* AppPaths;
      const file = path.join(userData, "usage.json");
      const scope = yield* Effect.scope;

      const saved = yield* Effect.sync(() => {
        try {
          return Schema.decodeUnknownSync(Schema.fromJsonString(SavedUsage))(
            fs.readFileSync(file, "utf8"),
          );
        } catch {
          return null;
        }
      });
      const pacing = yield* Ref.make<Pacing>({
        usage: {
          limits: saved?.limits ?? [],
          fetchedAt: saved?.fetchedAt ?? 0,
        },
        lastAttempt: saved?.fetchedAt ?? 0,
        blockedUntil: saved?.blockedUntil ?? 0,
        backoffMs: 0,
        scheduled: false,
      });
      const pubsub = yield* PubSub.unbounded<UsageData>();
      const lock = yield* Semaphore.make(1);

      const save = (p: Pacing) =>
        Effect.sync(() => {
          try {
            fs.writeFileSync(
              file,
              JSON.stringify({
                limits: p.usage.limits,
                fetchedAt: p.usage.fetchedAt,
                blockedUntil: p.blockedUntil,
              }),
            );
          } catch {}
        });

      const attempt = Effect.gen(function* () {
        const result = yield* source.fetch.pipe(
          Effect.map((limits) => ({ ok: true as const, limits })),
          Effect.catchTag("RateLimited", (e) =>
            Effect.succeed({
              ok: false as const,
              retryAfterMs: e.retryAfterMs,
            }),
          ),
          Effect.catchTag("UsageUnavailable", () =>
            Effect.succeed({ ok: false as const, retryAfterMs: null }),
          ),
        );
        const now = yield* Clock.currentTimeMillis;
        const next = yield* Ref.updateAndGet(pacing, (p): Pacing => {
          if (result.ok) {
            return {
              ...p,
              usage: { limits: result.limits, fetchedAt: now },
              backoffMs: 0,
              blockedUntil: 0,
            };
          }
          if (result.retryAfterMs === null) {
            return p;
          }
          const backoffMs = Math.min(
            p.backoffMs ? p.backoffMs * 2 : Duration.toMillis(BACKOFF),
            Duration.toMillis(MAX_BACKOFF),
          );
          return {
            ...p,
            backoffMs,
            blockedUntil: now + Math.max(result.retryAfterMs, backoffMs),
          };
        });
        yield* save(next);
        yield* PubSub.publish(pubsub, next.usage);
        return next.usage;
      });

      const refresh: UsageShape["refresh"] = (options) =>
        Semaphore.withPermit(
          lock,
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const p = yield* Ref.get(pacing);
            const gap = Duration.toMillis(
              options?.manual ? MANUAL_GAP : MIN_GAP,
            );
            const due = Math.max(p.blockedUntil, p.lastAttempt + gap);
            if (now < due) {
              if (!p.scheduled) {
                yield* Ref.update(pacing, (q) => ({ ...q, scheduled: true }));
                // Deferred refresh unless another attempt ran.
                const wake = Effect.gen(function* () {
                  const q = yield* Ref.getAndUpdate(pacing, (q) => ({
                    ...q,
                    scheduled: false,
                  }));
                  if (q.lastAttempt === p.lastAttempt) {
                    yield* refresh();
                  }
                });
                yield* Effect.sleep(due - now).pipe(
                  Effect.andThen(wake),
                  Effect.forkIn(scope),
                );
              }
              return p.usage;
            }
            yield* Ref.update(pacing, (q) => ({ ...q, lastAttempt: now }));
            return yield* attempt;
          }),
        );

      return Usage.of({
        get: Ref.get(pacing).pipe(Effect.map((p) => p.usage)),
        refresh,
        changes: PubSub.subscribe(pubsub).pipe(
          Effect.map(Stream.fromSubscription),
        ),
      });
    }),
  );
}
