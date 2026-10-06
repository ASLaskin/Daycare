// Claude Code settings file paths and safe edits.

import { Effect } from "effect"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"
import { isJsonObject, type Json, type JsonObject, obj } from "../../shared/json.ts"
import { SkillError } from "./errors.ts"
import { codeOf, parseSettingsText } from "./files.ts"

export const userSettingsPath = (home: DirPath) => asFilePath(path.join(home, ".claude", "settings.json"))
export const projectSettingsPath = (dir: DirPath) => asFilePath(path.join(dir, ".claude", "settings.json"))
export const projectLocalPath = (dir: DirPath) => asFilePath(path.join(dir, ".claude", "settings.local.json"))

const realPathOr = (file: string) => {
  try {
    return fs.realpathSync(file)
  } catch {
    return file
  }
}

const modeOf = (file: string) => {
  try {
    return fs.statSync(file).mode & 0o777
  } catch {
    return undefined
  }
}

// Atomic JSON write through a symlink, keeping file mode.
const writeJsonAtomic = (file: FilePath, value: JsonObject) => {
  const target = realPathOr(file)
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`)
  const mode = modeOf(target)
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", mode ? { mode } : undefined)
    fs.renameSync(tmp, target)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

// Sets or removes one entry of a settings map, never overwriting bad JSON.
// Object without one key
const without = (o: JsonObject, key: string): JsonObject => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

export const mutateSettingsMap = (file: FilePath, mapKey: string, entry: string, value: Json | undefined) =>
  Effect.gen(function* () {
    const name = path.basename(file)
    let parsed: Json = {}
    let existed = true
    try {
      parsed = parseSettingsText(fs.readFileSync(file, "utf8"))
    } catch (err) {
      if (codeOf(err) !== "ENOENT") {
        return yield* new SkillError({ message: `${name} could not be read as JSON, so it was left unchanged. Fix it and try again.` })
      }
      existed = false
    }
    if (!isJsonObject(parsed)) {
      return yield* new SkillError({ message: `${name} is not a JSON object, so it was left unchanged.` })
    }
    const map = obj(parsed[mapKey]) ?? {}
    if (value === undefined && (!existed || !(entry in map))) {
      return
    }
    const nextMap = value === undefined ? without(map, entry) : { ...map, [entry]: value }
    const next = Object.keys(nextMap).length ? { ...parsed, [mapKey]: nextMap } : without(parsed, mapKey)
    yield* Effect.try({
      try: () => writeJsonAtomic(file, next),
      catch: (err) => new SkillError({ message: `Could not write ${name}: ${codeOf(err)}` }),
    })
  })
