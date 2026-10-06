// Skills shipped by installed Claude Code plugins.

import path from "node:path"
import { asSkillId } from "../../shared/ids.ts"
import { arr, type Json, type JsonObject, obj, str } from "../../shared/json.ts"
import type { Collector } from "./collector.ts"
import { childDirs } from "./discover.ts"
import { lstatOrNull, readJson, readSkillFile } from "./files.ts"

interface InstallEntry {
  readonly installPath: string
  readonly lastUpdated: number
}

const installEntry = (e: Json): ReadonlyArray<InstallEntry> => {
  const installPath = str(obj(e)?.["installPath"])
  return installPath === null ? [] : [{ installPath, lastUpdated: Date.parse(String(obj(e)?.["lastUpdated"])) || 0 }]
}

// Newest install entry; stable sort keeps ties in file order.
const newestEntry = (rawEntry: Json): InstallEntry | null =>
  (Array.isArray(rawEntry) ? arr(rawEntry) : [rawEntry])
    .flatMap(installEntry)
    .sort((x, y) => y.lastUpdated - x.lastUpdated)[0] ?? null

// Marketplace folder for a plugin with no install entry.
const marketplaceRoot = (pluginsRoot: string, known: JsonObject, marketplace: string, pluginName: string) => {
  const loc = str(obj(known[marketplace])?.["installLocation"])
  const candidates = [loc && path.join(loc, "plugins", pluginName), path.join(pluginsRoot, "marketplaces", marketplace, "plugins", pluginName)]
  return candidates.find((p): p is string => !!p && !!lstatOrNull(p)) ?? null
}

export interface PluginScan {
  readonly pluginIds: ReadonlySet<string>
  readonly enabledMap: JsonObject
}

export const collectPlugins = (c: Collector): PluginScan => {
  const pluginsRoot = path.join(c.home, ".claude", "plugins")
  const installed = readJson(path.join(pluginsRoot, "installed_plugins.json"), c.warnings)
  const known = readJson(path.join(pluginsRoot, "known_marketplaces.json"), c.warnings) ?? {}
  const enabledMap = obj(c.userLayer.json?.["enabledPlugins"]) ?? {}
  const installedPlugins = obj(installed?.["plugins"]) ?? {}
  const pluginIds = new Set(Object.keys(installedPlugins))

  Object.entries(installedPlugins).forEach(([pluginId, rawEntry]) => {
    const entry = newestEntry(rawEntry)
    const [pluginName = "", marketplace] = pluginId.split("@")
    const root = entry ? entry.installPath : marketplace ? marketplaceRoot(pluginsRoot, known, marketplace, pluginName) : null
    if (!root || !lstatOrNull(root)) {
      c.warnings.push(`Plugin ${pluginId}: install directory not found`)
      return
    }
    const state = enabledMap[pluginId] !== false ? "on" : "off"
    childDirs(path.join(root, "skills"), c.warnings, true).forEach((child) => {
      const file = readSkillFile(child.dir, c.warnings)
      if (file) {
        c.add(
          {
            id: asSkillId(`plugin:${pluginId}:${child.name}`),
            kind: "skill",
            dirName: child.name,
            source: "plugin",
            scope: pluginId,
            dir: child.dir,
            plugin: pluginName,
            symlink: child.symlink,
          },
          file,
          state,
          c.userLayer.file,
          "plugin",
        )
      }
    })
  })
  return { pluginIds, enabledMap }
}
