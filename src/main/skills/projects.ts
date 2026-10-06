// Skills and commands inside open project folders.

import path from "node:path"
import { asDirPath, asSkillId, type DirPath } from "../../shared/ids.ts"
import type { Collector } from "./collector.ts"
import { childDirs, findCommandFiles } from "./discover.ts"
import { lstatOrNull, readMdFile, readSkillFile } from "./files.ts"
import type { SettingsLayer } from "./overrides.ts"
import { projectLocalPath, projectSettingsPath } from "./settings-files.ts"

export interface ProjectLayers {
  readonly dir: DirPath
  readonly layers: ReadonlyArray<SettingsLayer>
}

const collectProject = (c: Collector, dir: DirPath): ProjectLayers => {
  const layers = [c.layer(projectLocalPath(dir)), c.layer(projectSettingsPath(dir)), c.userLayer]
  childDirs(path.join(dir, ".claude", "skills"), c.warnings, true).forEach((child) => {
    const file = readSkillFile(child.dir, c.warnings)
    if (file) {
      c.addOverridable(
        { id: asSkillId(`project:${dir}:${child.name}`), kind: "skill", dirName: child.name, source: "project", scope: dir, dir: child.dir, symlink: child.symlink },
        file,
        layers,
      )
    }
  })
  findCommandFiles(path.join(dir, ".claude", "commands"), c.warnings).forEach((cmd) => {
    const file = readMdFile(cmd.file, c.warnings)
    if (file) {
      c.addOverridable(
        { id: asSkillId(`project-command:${dir}:${cmd.rel}`), kind: "command", dirName: cmd.base, source: "command", scope: dir, dir: cmd.dir, symlink: cmd.symlink },
        file,
        layers,
      )
    }
  })
  return { dir, layers: layers.slice(0, 2) }
}

// Scans each unique existing project folder, excluding home.
export const collectProjects = (c: Collector, projectDirs: ReadonlyArray<DirPath>): Array<ProjectLayers> => {
  const seen = new Set<DirPath>()
  return projectDirs.filter(Boolean).flatMap((raw) => {
    const dir = asDirPath(path.resolve(raw))
    if (seen.has(dir) || dir === c.home) {
      return []
    }
    seen.add(dir)
    if (!lstatOrNull(dir)) {
      c.warnings.push(`Project directory not found: ${dir}`)
      return []
    }
    return [collectProject(c, dir)]
  })
}
