// Resolves skillOverrides across settings layers.

import type { FilePath } from "../../shared/ids.ts"
import { type Json, type JsonObject, obj } from "../../shared/json.ts"
import type { SkillState } from "../../shared/skills.ts"
import type { Warnings } from "./files.ts"

const STATES: ReadonlyArray<string> = ["on", "name-only", "user-invocable-only", "off"]

export const isState = (v: Json | undefined): v is SkillState => typeof v === "string" && STATES.includes(v)

export interface SettingsLayer {
  readonly file: FilePath
  readonly json: JsonObject | null
}

export const overridesOf = (layer: SettingsLayer): JsonObject | null => obj(layer.json?.["skillOverrides"])

// Override from the highest precedence layer that sets one.
export const resolveOverride = (name: string, layers: ReadonlyArray<SettingsLayer>, warnings: Warnings) => {
  const layer = layers.find((l) => {
    const map = overridesOf(l)
    if (!map || !(name in map)) {
      return false
    }
    if (isState(map[name])) {
      return true
    }
    warnings.push(`Ignored unknown skillOverrides value for "${name}" in ${l.file}`)
    return false
  })
  const state = layer ? overridesOf(layer)?.[name] : undefined
  return layer && isState(state) ? { state, file: layer.file } : { state: "on" as const, file: null }
}
