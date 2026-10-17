// Fetches plan usage from the Claude OAuth API.

import { Context, Effect, Layer } from "effect"
import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { AccountId, DirPath } from "../../shared/ids.ts"
import { at, type Json, parseJson, str } from "../../shared/json.ts"
import type { UsageLimit } from "../../shared/usage.ts"
import { keychainService } from "../accounts/keychain.ts"
import { configDirFor, configHomeFor } from "../accounts/paths.ts"
import { AppPaths } from "../AppPaths.ts"
import { RateLimited, UsageUnavailable } from "./errors.ts"
import { normalizeUsage, retryAfterMs } from "./normalize.ts"

const tokenFromJson = (raw: string): string | null => str(at(parseJson(raw) ?? null, "claudeAiOauth", "accessToken"))

// OAuth token from the Mac keychain, else the credentials file.
const oauthToken = (configDir: DirPath | null, configHome: DirPath) =>
  Effect.callback<string | null>((resume) => {
    const fromFile = () => {
      try {
        resume(Effect.succeed(tokenFromJson(fs.readFileSync(path.join(configHome, ".credentials.json"), "utf8"))))
      } catch {
        resume(Effect.succeed(null))
      }
    }
    if (process.platform !== "darwin") {
      return fromFile()
    }
    execFile("security", ["find-generic-password", "-s", keychainService(configDir), "-w"], (err, out) => {
      const token = err ? null : tokenFromJson(out)
      if (!token) {
        return fromFile()
      }
      resume(Effect.succeed(token))
    })
  })

const fetchUsage = (configDir: DirPath | null, configHome: DirPath) =>
  Effect.gen(function* () {
    const token = yield* oauthToken(configDir, configHome)
    if (!token) {
      return yield* new UsageUnavailable({ reason: "Not signed in to Claude Code" })
    }
    const res = yield* Effect.tryPromise({
      try: (signal) =>
        fetch("https://api.anthropic.com/api/oauth/usage", {
          headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "content-type": "application/json" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        }),
      catch: (err) => new UsageUnavailable({ reason: String(err) }),
    })
    if (res.status === 429) {
      return yield* new RateLimited({ retryAfterMs: retryAfterMs(res.headers.get("retry-after"), Date.now()) })
    }
    if (res.status === 401) {
      return yield* new UsageUnavailable({ reason: "Token expired, run claude once to refresh" })
    }
    if (!res.ok) {
      return yield* new UsageUnavailable({ reason: `Usage request failed (${res.status})` })
    }
    const text = yield* Effect.tryPromise({ try: () => res.text(), catch: () => new UsageUnavailable({ reason: "Bad usage response" }) })
    const body: Json | null = parseJson(text)
    if (body === null) {
      return yield* new UsageUnavailable({ reason: "Bad usage response" })
    }
    return normalizeUsage(body)
  })

export class UsageSource extends Context.Service<
  UsageSource,
  { readonly fetch: (account: AccountId) => Effect.Effect<ReadonlyArray<UsageLimit>, RateLimited | UsageUnavailable> }
>()("daycare/UsageSource") {
  static readonly layer = Layer.effect(
    UsageSource,
    Effect.gen(function* () {
      const { home, userData } = yield* AppPaths
      return UsageSource.of({ fetch: (account) => fetchUsage(configDirFor(userData, account), configHomeFor(home, userData, account)) })
    }),
  )
}
