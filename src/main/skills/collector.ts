// Shared state while scanning every skill source.

import type { DirPath, FilePath } from "../../shared/ids.ts"
import type { RowState, SkillRow } from "../../shared/skills.ts"
import { type MdFile, readJson, type Warnings } from "./files.ts"
import { str } from "./frontmatter.ts"
import { makeRow, type RowBase } from "./listing.ts"
import { resolveOverride, type SettingsLayer } from "./overrides.ts"
import { userSettingsPath } from "./settings-files.ts"

export interface Collector {
  readonly home: DirPath
  readonly warnings: Warnings
  readonly rows: Array<SkillRow>
  readonly userLayer: SettingsLayer
  readonly layer: (file: FilePath) => SettingsLayer
  readonly add: (base: RowBase, file: MdFile, state: RowState, settingsFile: FilePath | null, locked?: "plugin" | null) => void
  readonly addOverridable: (base: RowBase, file: MdFile, layers: ReadonlyArray<SettingsLayer>) => void
}

export const makeCollector = (home: DirPath): Collector => {
  const warnings: Warnings = []
  const rows: Array<SkillRow> = []
  const cache = new Map<FilePath, SettingsLayer>()

  const layer = (file: FilePath): SettingsLayer => {
    const cached = cache.get(file) ?? { file, json: readJson(file, warnings) }
    cache.set(file, cached)
    return cached
  }

  const add: Collector["add"] = (base, file, state, settingsFile, locked = null) => {
    const row = makeRow(base, file, state, settingsFile, locked)
    if (base.symlink && base.kind === "skill") {
      warnings.push(
        `"${row.name}" is a link to ${base.dir}. Claude Code may skip skill folders that are links, so if this skill is not showing up in a session, that is the likely cause.`,
      )
    }
    rows.push(row)
  }

  const addOverridable: Collector["addOverridable"] = (base, file, layers) => {
    const ov = resolveOverride(str(file.data["name"]) || base.dirName, layers, warnings)
    add(base, file, ov.state, ov.file)
  }

  return { home, warnings, rows, userLayer: layer(userSettingsPath(home)), layer, add, addOverridable }
}
