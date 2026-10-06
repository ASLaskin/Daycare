// Personal, synced, command and parked skills under ~/.claude.

import path from "node:path"
import { asSkillId } from "../../shared/ids.ts"
import type { Collector } from "./collector.ts"
import { childDirs, findCommandFiles, findSkillDirs } from "./discover.ts"
import { readMdFile, readSkillFile } from "./files.ts"

const PERSONAL_SCOPE = "~/.claude/skills"
const PARKED_SCOPE = "~/.claude/skills-disabled"
const COMMANDS_SCOPE = "~/.claude/commands"
const SYNCED_MAX_DEPTH = 3

export const collectPersonal = (c: Collector) => {
  const claudeDir = path.join(c.home, ".claude")
  const skillsRoot = path.join(claudeDir, "skills")
  const syncedRoot = path.join(skillsRoot, "synced")
  const user = [c.userLayer]

  childDirs(skillsRoot, c.warnings, true)
    .filter((child) => child.name !== "synced")
    .forEach((child) => {
      const file = readSkillFile(child.dir, c.warnings)
      if (file) {
        c.addOverridable(
          { id: asSkillId(`personal:${child.name}`), kind: "skill", dirName: child.name, source: "personal", scope: PERSONAL_SCOPE, dir: child.dir, symlink: child.symlink },
          file,
          user,
        )
      }
    })

  findSkillDirs(syncedRoot, SYNCED_MAX_DEPTH, c.warnings).forEach((child) => {
    const file = readSkillFile(child.dir, c.warnings)
    if (!file) {
      return
    }
    const rel = path.relative(syncedRoot, child.viaPath).split(path.sep).join("/")
    c.addOverridable(
      { id: asSkillId(`synced:${rel}`), kind: "skill", dirName: child.name, source: "synced", scope: `${PERSONAL_SCOPE}/synced`, dir: child.dir, symlink: child.symlink },
      file,
      user,
    )
  })

  findCommandFiles(path.join(claudeDir, "commands"), c.warnings).forEach((cmd) => {
    const file = readMdFile(cmd.file, c.warnings)
    if (file) {
      c.addOverridable(
        { id: asSkillId(`command:${cmd.rel}`), kind: "command", dirName: cmd.base, source: "command", scope: COMMANDS_SCOPE, dir: cmd.dir, symlink: cmd.symlink },
        file,
        user,
      )
    }
  })

  childDirs(path.join(claudeDir, "skills-disabled"), c.warnings, true).forEach((child) => {
    const file = readSkillFile(child.dir, c.warnings)
    if (file) {
      c.add(
        { id: asSkillId(`parked:${child.name}`), kind: "skill", dirName: child.name, source: "parked", scope: PARKED_SCOPE, dir: child.dir, symlink: child.symlink },
        file,
        "parked",
        null,
      )
    }
  })
}
