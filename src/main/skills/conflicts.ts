// Warnings for project settings that override the user's choice.

import type { DirPath } from "../../shared/ids.ts"
import { type JsonObject, obj } from "../../shared/json.ts"
import type { SkillRow, SkillSource } from "../../shared/skills.ts"
import type { Warnings } from "./files.ts"
import { isState, overridesOf, type SettingsLayer } from "./overrides.ts"
import type { ProjectLayers } from "./projects.ts"

const PERSONAL_SOURCES = new Set<SkillSource>(["personal", "synced", "command"])

const skillConflicts = (dir: DirPath, l: SettingsLayer, rows: ReadonlyArray<SkillRow>): Array<string> => {
  const map = overridesOf(l)
  if (!map) {
    return []
  }
  return rows
    .filter((r) => {
      const value = map[r.name]
      return PERSONAL_SOURCES.has(r.source) && isState(value) && value !== r.state
    })
    .map((r) => `"${r.name}" is ${String(map[r.name])} in ${dir} because of ${l.file}. This row shows the setting outside that project.`)
}

const pluginConflicts = (dir: DirPath, l: SettingsLayer, pluginIds: ReadonlySet<string>, enabledMap: JsonObject): Array<string> => {
  const plugins = obj(l.json?.["enabledPlugins"])
  if (!plugins) {
    return []
  }
  return Object.entries(plugins)
    .filter(([pluginId, value]) => typeof value === "boolean" && pluginIds.has(pluginId) && value !== (enabledMap[pluginId] !== false))
    .map(
      ([pluginId, value]) =>
        `Plugin ${pluginId} is ${value ? "on" : "off"} in ${dir} because of ${l.file}. Turning it ${value ? "off" : "on"} here will not change that project.`,
    )
}

export const projectConflicts = (
  projects: ReadonlyArray<ProjectLayers>,
  rows: ReadonlyArray<SkillRow>,
  pluginIds: ReadonlySet<string>,
  enabledMap: JsonObject,
): Warnings =>
  projects.flatMap(({ dir, layers }) =>
    layers.flatMap((l) => [...skillConflicts(dir, l, rows), ...pluginConflicts(dir, l, pluginIds, enabledMap)]),
  )
