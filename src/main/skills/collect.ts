// Full skills listing across every source.

import type { DirPath } from "../../shared/ids.ts"
import type { SkillsListing } from "../../shared/skills.ts"
import { makeCollector } from "./collector.ts"
import { projectConflicts } from "./conflicts.ts"
import type { Warnings } from "./files.ts"
import { totalsOf } from "./listing.ts"
import { collectPersonal } from "./personal.ts"
import { collectPlugins } from "./plugins.ts"
import { collectProjects } from "./projects.ts"

export interface Collected {
  readonly result: SkillsListing & { warnings: Warnings }
  readonly pluginIds: ReadonlySet<string>
}

export const collect = (home: DirPath, projectDirs: ReadonlyArray<DirPath>): Collected => {
  const c = makeCollector(home)
  collectPersonal(c)
  const projects = collectProjects(c, projectDirs)
  const { pluginIds, enabledMap } = collectPlugins(c)
  c.warnings.push(...projectConflicts(projects, c.rows, pluginIds, enabledMap))
  return { result: { skills: c.rows, totals: totalsOf(c.rows), warnings: c.warnings }, pluginIds }
}
