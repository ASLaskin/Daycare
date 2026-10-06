// Skills service: lists skills and edits their settings, never SKILL.md.

import { Context, Effect, Layer } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { asDirPath, type DirPath, type SkillId } from "../../shared/ids.ts"
import type { SkillsListing, SkillState } from "../../shared/skills.ts"
import { collect } from "./collect.ts"
import { notFound, SkillError } from "./errors.ts"
import { codeOf, lstatOrNull } from "./files.ts"
import { isProjectId, kindOf, projectDirFromId } from "./ids.ts"
import { mutateSettingsMap, projectLocalPath, userSettingsPath } from "./settings-files.ts"

export interface SkillsShape {
  readonly list: (projectDirs: ReadonlyArray<DirPath>) => Effect.Effect<SkillsListing>
  readonly setState: (
    input: { readonly id: SkillId; readonly state: SkillState },
    projectDirs: ReadonlyArray<DirPath>,
  ) => Effect.Effect<SkillsListing, SkillError>
  readonly setPlugin: (
    input: { readonly id: SkillId; readonly enabled: boolean },
    projectDirs: ReadonlyArray<DirPath>,
  ) => Effect.Effect<SkillsListing, SkillError>
  readonly restore: (input: { readonly id: SkillId }, projectDirs: ReadonlyArray<DirPath>) => Effect.Effect<SkillsListing, SkillError>
}

const isSafeDirName = (name: string) => !!name && name === path.basename(name) && name !== "." && name !== ".."

const make = (home: DirPath): SkillsShape => {
  const list = (projectDirs: ReadonlyArray<DirPath>) => Effect.sync(() => collect(home, projectDirs).result)

  const setState = Effect.fn("Skills.setState")(function* (
    input: { readonly id: SkillId; readonly state: SkillState },
    projectDirs: ReadonlyArray<DirPath>,
  ) {
    const { id, state } = input
    const fromId = isProjectId(id) ? projectDirFromId(id) : null
    const projectDir = fromId ? asDirPath(fromId) : null
    const dirs = projectDir ? [...projectDirs, projectDir] : [...projectDirs]
    const rowOf = (listing: SkillsListing) => listing.skills.find((r) => r.id === id)

    const row = rowOf(collect(home, dirs).result)
    if (!row) {
      return yield* notFound
    }
    if (row.source === "plugin") {
      return yield* new SkillError({ message: "Plugin skills are turned on or off with their plugin." })
    }
    if (row.source === "parked") {
      return yield* new SkillError({ message: "This skill is parked. Restore it before changing its state." })
    }
    const file = projectDir ? projectLocalPath(projectDir) : userSettingsPath(home)
    yield* mutateSettingsMap(file, "skillOverrides", row.name, state === "on" ? undefined : state)

    // Retry with an explicit override when a lower layer wins.
    const after = collect(home, dirs).result
    if (rowOf(after)?.state === state || !rowOf(after)) {
      return after
    }
    yield* mutateSettingsMap(file, "skillOverrides", row.name, state)
    const retried = collect(home, dirs).result
    const stuck = rowOf(retried)
    if (stuck && stuck.state !== state) {
      retried.warnings.push(
        `"${row.name}" is still ${stuck.state} because ${stuck.settingsFile ?? "another settings file"} overrides it. Edit that file to change it.`,
      )
    }
    return retried
  })

  const setPlugin = Effect.fn("Skills.setPlugin")(function* (
    input: { readonly id: SkillId; readonly enabled: boolean },
    projectDirs: ReadonlyArray<DirPath>,
  ) {
    const pluginId = kindOf(input.id) === "plugin" ? (input.id.slice("plugin:".length).split(":")[0] ?? "") : input.id
    const { pluginIds } = collect(home, projectDirs)
    if (!pluginId || !pluginIds.has(pluginId)) {
      return yield* new SkillError({ message: "That plugin was not found. Refresh the list and try again." })
    }
    yield* mutateSettingsMap(userSettingsPath(home), "enabledPlugins", pluginId, input.enabled)
    return collect(home, projectDirs).result
  })

  const restore = Effect.fn("Skills.restore")(function* (input: { readonly id: SkillId }, projectDirs: ReadonlyArray<DirPath>) {
    if (kindOf(input.id) !== "parked") {
      return yield* new SkillError({ message: "Only parked skills can be restored." })
    }
    const dirName = input.id.slice("parked:".length)
    if (!isSafeDirName(dirName)) {
      return yield* notFound
    }
    const from = path.join(home, ".claude", "skills-disabled", dirName)
    const to = path.join(home, ".claude", "skills", dirName)
    const st = lstatOrNull(from)
    if (!st || !(st.isDirectory() || st.isSymbolicLink())) {
      return yield* new SkillError({ message: "That parked skill is no longer there. Refresh the list and try again." })
    }
    if (lstatOrNull(to)) {
      return yield* new SkillError({
        message: `A skill named "${dirName}" already exists in ~/.claude/skills. Rename or remove one of them first.`,
      })
    }
    yield* Effect.try({
      try: () => {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.renameSync(from, to)
      },
      catch: (err) => new SkillError({ message: `Could not restore ${dirName}: ${codeOf(err)}` }),
    })
    return collect(home, projectDirs).result
  })

  return { list, setState, setPlugin, restore }
}

export class Skills extends Context.Service<Skills, SkillsShape>()("daycare/Skills") {
  // Skills for any home folder.
  static readonly layerFor = (home: string) => Layer.succeed(Skills, make(asDirPath(path.resolve(home))))
  static readonly layer = Skills.layerFor(os.homedir())
}
