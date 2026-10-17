// App settings persisted to settings.json.

import { Context, Effect, Layer, PubSub, Ref, Scope, Stream } from "effect"
import fs from "node:fs"
import path from "node:path"
import { asDirPath } from "../../shared/ids.ts"
import { isJsonObject, type Json, type JsonObject, parseJson } from "../../shared/json.ts"
import { baseSettings, type Location, mergeSettings, type Settings } from "../../shared/settings.ts"
import { AppPaths } from "../AppPaths.ts"

// Default folder shortcuts that exist on this machine.
const candidateLocations = (home: string): ReadonlyArray<Location> => {
  const loc = (label: string, ...parts: Array<string>) => ({ label, path: asDirPath(path.join(home, ...parts)) })
  const found = [
    loc("Desktop", "Desktop"),
    loc("extracurriculars", "Desktop", "extracurriculars"),
    loc("taxfyle", "projects", "taxfyle"),
    loc("physics-channel", "Desktop", "extracurriculars", "physics-channel"),
  ].filter((l) => fs.existsSync(l.path))
  return found.length ? found : [{ label: "Home", path: asDirPath(home) }]
}

export const defaultSettings = (home: string): Settings => ({ ...baseSettings, locations: candidateLocations(home) })

// Older files kept the master model under model
const upgradeLegacy = (raw: Json | null): Json | undefined => {
  if (!isJsonObject(raw) || !("model" in raw) || "masterModel" in raw) {
    return raw ?? undefined
  }
  const { model, ...rest } = raw
  return { ...rest, masterModel: model }
}

const readSettings = (file: string, defaults: Settings) => {
  try {
    return mergeSettings(defaults, upgradeLegacy(parseJson(fs.readFileSync(file, "utf8"))))
  } catch {
    return defaults
  }
}

export interface SettingsStoreShape {
  readonly get: Effect.Effect<Settings>
  // Merges a partial update, dropping fields that do not decode.
  readonly update: (patch: JsonObject) => Effect.Effect<Settings>
  readonly changes: Effect.Effect<Stream.Stream<Settings>, never, Scope.Scope>
}

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()("daycare/SettingsStore") {
  static readonly layer = Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const { userData, home } = yield* AppPaths
      const file = path.join(userData, "settings.json")
      const ref = yield* Ref.make(readSettings(file, defaultSettings(home)))
      const pubsub = yield* PubSub.unbounded<Settings>()

      const update = (patch: JsonObject) =>
        Effect.gen(function* () {
          const next = mergeSettings(yield* Ref.get(ref), patch)
          yield* Effect.sync(() => {
            fs.mkdirSync(userData, { recursive: true })
            fs.writeFileSync(file, JSON.stringify(next, null, 2))
          })
          yield* Ref.set(ref, next)
          yield* PubSub.publish(pubsub, next)
          return next
        })

      return SettingsStore.of({
        get: Ref.get(ref),
        update,
        changes: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
      })
    }),
  )
}
