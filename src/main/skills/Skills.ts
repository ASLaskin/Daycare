// Never writes SKILL.md; scan never fails.

import { Context, Effect, Layer, Schema } from "effect"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { RowState, SkillRow, SkillSource, SkillsListing, SkillState, SkillTotals } from "../../shared/skills.ts"
import { type Frontmatter, isFalse, isTrue, parseFrontmatter, str } from "./frontmatter.ts"

export class SkillError extends Schema.TaggedError<SkillError>()("SkillError", { message: Schema.String }) {}

// About four characters per token.
const CHARS_PER_TOKEN = 4
const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN)

// Models Claude Code's two listing caps.
const LISTING_MAX_DESC_CHARS = 1536
const LISTING_BUDGET_FRACTION = 0.01
const LISTING_CONTEXT_CHARS = 200000
const LISTING_BUDGET_CHARS = Math.floor(LISTING_CONTEXT_CHARS * CHARS_PER_TOKEN * LISTING_BUDGET_FRACTION)

const MAX_SKILL_BYTES = 1024 * 1024
const SYNCED_MAX_DEPTH = 3
const STATES: ReadonlyArray<string> = ["on", "name-only", "user-invocable-only", "off"]
const isState = (v: unknown): v is SkillState => typeof v === "string" && STATES.includes(v)

const PERSONAL_SCOPE = "~/.claude/skills"
const PARKED_SCOPE = "~/.claude/skills-disabled"
const COMMANDS_SCOPE = "~/.claude/commands"

type Warnings = Array<string>
type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)
const codeOf = (err: unknown) => (err as NodeJS.ErrnoException).code ?? (err as Error).message

// ---------- filesystem helpers ----------

const lstatOrNull = (p: string) => {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

const readDirSafe = (dir: string, warnings: Warnings, quietIfMissing: boolean) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    if (!(quietIfMissing && codeOf(err) === "ENOENT")) warnings.push(`Cannot read ${dir}: ${codeOf(err)}`)
    return null
  }
}

// Tolerate a BOM and empty files.
const parseSettingsText = (raw: string): unknown => {
  const text = raw.replace(/^﻿/, "")
  return text.trim() ? JSON.parse(text) : {}
}

const readJson = (file: string, warnings: Warnings): Json | null => {
  let raw: string
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch (err) {
    if (codeOf(err) !== "ENOENT") warnings.push(`Cannot read ${file}: ${codeOf(err)}`)
    return null
  }
  try {
    const parsed = parseSettingsText(raw)
    if (isObject(parsed)) return parsed
    warnings.push(`${file} is not a JSON object`)
  } catch {
    warnings.push(`${file} is not valid JSON`)
  }
  return null
}

interface MdFile {
  readonly text: string
  readonly data: Frontmatter
}

// Size guard applies to the target.
const readMdFile = (file: string, warnings: Warnings): MdFile | null => {
  let st: fs.Stats
  try {
    st = fs.statSync(file)
  } catch (err) {
    warnings.push(`Skipped ${file}: ${codeOf(err) === "ENOENT" ? "broken link or missing file" : codeOf(err)}`)
    return null
  }
  if (!st.isFile()) {
    warnings.push(`Skipped ${file}: not a regular file`)
    return null
  }
  if (st.size > MAX_SKILL_BYTES) {
    warnings.push(`Skipped ${file}: larger than 1 MB`)
    return null
  }
  try {
    const text = fs.readFileSync(file, "utf8")
    return { text, data: parseFrontmatter(text).data }
  } catch (err) {
    warnings.push(`Cannot read ${file}: ${codeOf(err)}`)
    return null
  }
}

const readSkillFile = (dir: string, warnings: Warnings) => {
  const file = path.join(dir, "SKILL.md")
  if (!lstatOrNull(file)) {
    warnings.push(`Skipped ${dir}: no SKILL.md`)
    return null
  }
  return readMdFile(file, warnings)
}

interface ChildDir {
  readonly name: string
  // viaPath is where it was found.
  readonly dir: string
  readonly viaPath: string
  readonly symlink: boolean
}

// Bad links are skipped with a warning.
const childDirs = (root: string, warnings: Warnings, quietIfMissing: boolean): Array<ChildDir> => {
  const out: Array<ChildDir> = []
  for (const e of readDirSafe(root, warnings, quietIfMissing) ?? []) {
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      out.push({ name: e.name, dir: full, viaPath: full, symlink: false })
    } else if (e.isSymbolicLink()) {
      let resolved: string
      try {
        resolved = fs.realpathSync(full)
        if (!fs.statSync(resolved).isDirectory()) {
          warnings.push(`Skipped ${full}: link does not point to a folder`)
          continue
        }
      } catch (err) {
        warnings.push(
          `Skipped ${full}: ${codeOf(err) === "ELOOP" ? "link loops back on itself" : "broken link, its target is missing"}`,
        )
        continue
      }
      out.push({ name: e.name, dir: resolved, viaPath: full, symlink: true })
    }
  }
  return out
}

// Skill folders are not descended into.
const findSkillDirs = (root: string, maxDepth: number, warnings: Warnings) => {
  const found: Array<ChildDir> = []
  const visited = new Set<string>()
  const walk = (dir: string, depth: number) => {
    for (const child of childDirs(dir, warnings, true)) {
      if (visited.has(child.dir)) continue
      visited.add(child.dir)
      if (lstatOrNull(path.join(child.dir, "SKILL.md"))) found.push(child)
      else if (depth < maxDepth) walk(child.dir, depth + 1)
    }
  }
  walk(root, 1)
  return found
}

interface CommandFile {
  readonly file: string
  readonly dir: string
  readonly rel: string
  readonly base: string
  readonly symlink: boolean
}

// One subfolder level: namespaced commands.
const findCommandFiles = (dir: string, warnings: Warnings) => {
  const out: Array<CommandFile> = []
  const scan = (d: string, prefix: string, quiet: boolean, canDescend: boolean) => {
    for (const e of readDirSafe(d, warnings, quiet) ?? []) {
      const full = path.join(d, e.name)
      let isFile = e.isFile()
      let isDir = e.isDirectory()
      const link = e.isSymbolicLink()
      if (link) {
        try {
          const st = fs.statSync(full)
          isFile = st.isFile()
          isDir = st.isDirectory()
        } catch {
          warnings.push(`Skipped ${full}: broken link, its target is missing`)
          continue
        }
      }
      const base = e.name.slice(0, -3)
      if (isFile && e.name.endsWith(".md")) out.push({ file: full, dir: d, rel: prefix + base, base, symlink: link })
      else if (isDir && canDescend) scan(full, `${prefix}${e.name}/`, false, false)
    }
  }
  scan(dir, "", true, true)
  return out
}

// ---------- settings files ----------

const userSettingsPath = (home: string) => path.join(home, ".claude", "settings.json")
const projectSettingsPath = (dir: string) => path.join(dir, ".claude", "settings.json")
const projectLocalPath = (dir: string) => path.join(dir, ".claude", "settings.local.json")

const writeJsonAtomic = (file: string, obj: Json) => {
  // Write through a symlink, keep it.
  let target = file
  try {
    target = fs.realpathSync(file)
  } catch {}
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`)
  let mode: number | undefined
  try {
    mode = fs.statSync(target).mode & 0o777
  } catch {}
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", mode ? { mode } : undefined)
    fs.renameSync(tmp, target)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

// Never overwrites a malformed file.
const mutateSettingsMap = (file: string, mapKey: string, entry: string, value: unknown) =>
  Effect.gen(function* () {
    const name = path.basename(file)
    let obj: unknown = {}
    let existed = true
    try {
      obj = parseSettingsText(fs.readFileSync(file, "utf8"))
    } catch (err) {
      if (codeOf(err) !== "ENOENT") {
        return yield* new SkillError({ message: `${name} could not be read as JSON, so it was left unchanged. Fix it and try again.` })
      }
      existed = false
    }
    if (!isObject(obj)) {
      return yield* new SkillError({ message: `${name} is not a JSON object, so it was left unchanged.` })
    }
    const map: Json = isObject(obj[mapKey]) ? obj[mapKey] : {}
    if (value === undefined) {
      if (!existed || !(entry in map)) return
      delete map[entry]
    } else {
      map[entry] = value
    }
    if (Object.keys(map).length) obj[mapKey] = map
    else delete obj[mapKey]
    yield* Effect.try({
      try: () => writeJsonAtomic(file, obj),
      catch: (err) => new SkillError({ message: `Could not write ${name}: ${codeOf(err)}` }),
    })
  })

// ---------- listing ----------

// Name only drops the description.
const listingCharsFor = (state: RowState, name: string, description: string, whenToUse: string, modelInvocable: boolean) => {
  if (state === "off" || state === "parked" || state === "user-invocable-only" || !modelInvocable) return 0
  if (state === "name-only") return name.length + 2
  const desc = `${description}${whenToUse ? ` - ${whenToUse}` : ""}`
  return name.length + 4 + Math.min(desc.length, LISTING_MAX_DESC_CHARS)
}

interface RowBase {
  readonly id: string
  readonly kind: "skill" | "command"
  readonly dirName: string
  readonly source: SkillSource
  readonly scope: string
  readonly dir: string
  readonly symlink: boolean
  readonly plugin?: string
}

const makeRow = (base: RowBase, file: MdFile, state: RowState, settingsFile: string | null, locked: "plugin" | null): SkillRow => {
  const { text, data } = file
  const name = str(data["name"]) || base.dirName
  const description = str(data["description"])
  const whenToUse = str(data["when_to_use"])
  const parked = state === "parked"
  const frontmatterBlocksModel = isTrue(data["disable-model-invocation"])
  const userInvocable = !parked && state !== "off" && !isFalse(data["user-invocable"])
  const modelInvocable = !parked && state !== "off" && state !== "user-invocable-only" && !frontmatterBlocksModel
  const listingChars = listingCharsFor(state, name, description, whenToUse, modelInvocable)
  return {
    id: base.id,
    name,
    invoke: base.plugin ? `/${base.plugin}:${name}` : `/${name}`,
    source: base.source,
    scope: base.scope,
    dir: base.dir,
    description,
    whenToUse,
    state,
    locked: locked ?? (frontmatterBlocksModel ? "frontmatter" : null),
    userInvocable,
    modelInvocable,
    listingChars,
    listingTokens: Math.ceil(listingChars / CHARS_PER_TOKEN),
    bodyTokens: estimateTokens(text),
    settingsFile,
    symlink: base.symlink,
  }
}

interface SettingsLayer {
  readonly file: string
  readonly json: Json | null
}

const overridesOf = (layer: SettingsLayer): Json | null => {
  const map = layer.json?.["skillOverrides"]
  return isObject(map) ? map : null
}

// Highest precedence layer first.
const resolveOverride = (name: string, layers: ReadonlyArray<SettingsLayer>, warnings: Warnings) => {
  for (const layer of layers) {
    const map = overridesOf(layer)
    if (!map || !(name in map)) continue
    const value = map[name]
    if (isState(value)) return { state: value, file: layer.file }
    warnings.push(`Ignored unknown skillOverrides value for "${name}" in ${layer.file}`)
  }
  return { state: "on" as const, file: null }
}

interface Collected {
  readonly result: SkillsListing & { warnings: Warnings }
  readonly pluginIds: ReadonlySet<string>
}

const collect = (home: string, projectDirs: ReadonlyArray<string>): Collected => {
  const warnings: Warnings = []
  const rows: Array<SkillRow> = []
  const pluginIds = new Set<string>()
  const claudeDir = path.join(home, ".claude")

  const settingsCache = new Map<string, SettingsLayer>()
  const layer = (file: string) => {
    let cached = settingsCache.get(file)
    if (!cached) settingsCache.set(file, (cached = { file, json: readJson(file, warnings) }))
    return cached
  }
  const userLayer = layer(userSettingsPath(home))

  const add = (base: RowBase, file: MdFile, state: RowState, settingsFile: string | null, locked: "plugin" | null = null) => {
    const row = makeRow(base, file, state, settingsFile, locked)
    if (base.symlink && base.kind === "skill") {
      warnings.push(
        `"${row.name}" is a link to ${base.dir}. Claude Code may skip skill folders that are links, so if this skill is not showing up in a session, that is the likely cause.`,
      )
    }
    rows.push(row)
  }

  const addOverridable = (base: RowBase, file: MdFile, layers: ReadonlyArray<SettingsLayer>) => {
    const ov = resolveOverride(str(file.data["name"]) || base.dirName, layers, warnings)
    add(base, file, ov.state, ov.file)
  }

  const skillsRoot = path.join(claudeDir, "skills")
  for (const child of childDirs(skillsRoot, warnings, true)) {
    if (child.name === "synced") continue
    const file = readSkillFile(child.dir, warnings)
    if (!file) continue
    addOverridable(
      { id: `personal:${child.name}`, kind: "skill", dirName: child.name, source: "personal", scope: PERSONAL_SCOPE, dir: child.dir, symlink: child.symlink },
      file,
      [userLayer],
    )
  }
  const syncedRoot = path.join(skillsRoot, "synced")
  for (const child of findSkillDirs(syncedRoot, SYNCED_MAX_DEPTH, warnings)) {
    const file = readSkillFile(child.dir, warnings)
    if (!file) continue
    const rel = path.relative(syncedRoot, child.viaPath).split(path.sep).join("/")
    addOverridable(
      { id: `synced:${rel}`, kind: "skill", dirName: child.name, source: "synced", scope: `${PERSONAL_SCOPE}/synced`, dir: child.dir, symlink: child.symlink },
      file,
      [userLayer],
    )
  }

  for (const c of findCommandFiles(path.join(claudeDir, "commands"), warnings)) {
    const file = readMdFile(c.file, warnings)
    if (!file) continue
    addOverridable(
      { id: `command:${c.rel}`, kind: "command", dirName: c.base, source: "command", scope: COMMANDS_SCOPE, dir: c.dir, symlink: c.symlink },
      file,
      [userLayer],
    )
  }

  for (const child of childDirs(path.join(claudeDir, "skills-disabled"), warnings, true)) {
    const file = readSkillFile(child.dir, warnings)
    if (!file) continue
    add(
      { id: `parked:${child.name}`, kind: "skill", dirName: child.name, source: "parked", scope: PARKED_SCOPE, dir: child.dir, symlink: child.symlink },
      file,
      "parked",
      null,
    )
  }

  const projectLayerSets: Array<{ dir: string; layers: ReadonlyArray<SettingsLayer> }> = []
  const seen = new Set<string>()
  for (const raw of projectDirs) {
    if (!raw) continue
    const dir = path.resolve(raw)
    if (seen.has(dir) || dir === home) continue
    seen.add(dir)
    if (!lstatOrNull(dir)) {
      warnings.push(`Project directory not found: ${dir}`)
      continue
    }
    const layers = [layer(projectLocalPath(dir)), layer(projectSettingsPath(dir)), userLayer]
    projectLayerSets.push({ dir, layers: layers.slice(0, 2) })
    for (const child of childDirs(path.join(dir, ".claude", "skills"), warnings, true)) {
      const file = readSkillFile(child.dir, warnings)
      if (!file) continue
      addOverridable(
        { id: `project:${dir}:${child.name}`, kind: "skill", dirName: child.name, source: "project", scope: dir, dir: child.dir, symlink: child.symlink },
        file,
        layers,
      )
    }
    for (const c of findCommandFiles(path.join(dir, ".claude", "commands"), warnings)) {
      const file = readMdFile(c.file, warnings)
      if (!file) continue
      addOverridable(
        { id: `project-command:${dir}:${c.rel}`, kind: "command", dirName: c.base, source: "command", scope: dir, dir: c.dir, symlink: c.symlink },
        file,
        layers,
      )
    }
  }

  // Plugins: installPath only, skips stale versions.
  const pluginsRoot = path.join(claudeDir, "plugins")
  const installed = readJson(path.join(pluginsRoot, "installed_plugins.json"), warnings)
  const known = readJson(path.join(pluginsRoot, "known_marketplaces.json"), warnings) ?? {}
  const enabledMap: Json = isObject(userLayer.json?.["enabledPlugins"]) ? (userLayer.json["enabledPlugins"] as Json) : {}
  const installedPlugins: Json = isObject(installed?.["plugins"]) ? (installed["plugins"] as Json) : {}
  for (const [pluginId, rawEntry] of Object.entries(installedPlugins)) {
    pluginIds.add(pluginId)
    const entries = (Array.isArray(rawEntry) ? rawEntry : [rawEntry]).filter(
      (e): e is Json & { installPath: string } => isObject(e) && typeof e["installPath"] === "string",
    )
    // Stable sort keeps ties in order.
    const stamp = (e: Json) => Date.parse(String(e["lastUpdated"])) || 0
    const entry = entries.sort((x, y) => stamp(y) - stamp(x))[0] ?? null
    const [pluginName = "", marketplace] = pluginId.split("@")
    let root: string | null = entry ? entry.installPath : null
    if (!entry && marketplace) {
      // Never a glob of the cache.
      const market = known[marketplace]
      const loc = isObject(market) && typeof market["installLocation"] === "string" ? market["installLocation"] : null
      const candidates = [loc && path.join(loc, "plugins", pluginName), path.join(pluginsRoot, "marketplaces", marketplace, "plugins", pluginName)]
      root = candidates.find((c): c is string => !!c && !!lstatOrNull(c)) ?? null
    }
    if (!root || !lstatOrNull(root)) {
      warnings.push(`Plugin ${pluginId}: install directory not found`)
      continue
    }
    const enabled = enabledMap[pluginId] !== false
    for (const child of childDirs(path.join(root, "skills"), warnings, true)) {
      const file = readSkillFile(child.dir, warnings)
      if (!file) continue
      add(
        { id: `plugin:${pluginId}:${child.name}`, kind: "skill", dirName: child.name, source: "plugin", scope: pluginId, dir: child.dir, plugin: pluginName, symlink: child.symlink },
        file,
        enabled ? "on" : "off",
        userLayer.file,
        "plugin",
      )
    }
  }

  // Project files can override the user file.
  const personalSources = new Set<SkillSource>(["personal", "synced", "command"])
  for (const { dir, layers } of projectLayerSets) {
    for (const l of layers) {
      const map = overridesOf(l)
      if (map) {
        for (const r of rows) {
          const value = map[r.name]
          if (!personalSources.has(r.source) || !isState(value) || value === r.state) continue
          warnings.push(`"${r.name}" is ${value} in ${dir} because of ${l.file}. This row shows the setting outside that project.`)
        }
      }
      const plugins = l.json?.["enabledPlugins"]
      if (isObject(plugins)) {
        for (const [pluginId, value] of Object.entries(plugins)) {
          if (typeof value !== "boolean" || !pluginIds.has(pluginId)) continue
          if (value === (enabledMap[pluginId] !== false)) continue
          warnings.push(
            `Plugin ${pluginId} is ${value ? "on" : "off"} in ${dir} because of ${l.file}. Turning it ${value ? "off" : "on"} here will not change that project.`,
          )
        }
      }
    }
  }

  return { result: { skills: rows, totals: totalsOf(rows), warnings }, pluginIds }
}

const totalsOf = (rows: ReadonlyArray<SkillRow>): SkillTotals => {
  let listingChars = 0
  let listed = 0
  let on = 0
  let off = 0
  let parked = 0
  for (const r of rows) {
    listingChars += r.listingChars
    if (r.listingChars > 0) listed++
    if (r.state === "off") off++
    else if (r.state === "parked") parked++
    else on++
  }
  // Same separator Claude Code counts.
  listingChars += Math.max(0, listed - 1)
  const listingTokens = Math.ceil(listingChars / CHARS_PER_TOKEN)
  const budgetTokens = Math.ceil(LISTING_BUDGET_CHARS / CHARS_PER_TOKEN)
  return {
    listingChars,
    listingTokens,
    on,
    off,
    parked,
    budgetChars: LISTING_BUDGET_CHARS,
    budgetTokens,
    overBudget: listingChars > LISTING_BUDGET_CHARS,
    // Past budget, the budget is the cost.
    effectiveTokens: Math.min(listingTokens, budgetTokens),
  }
}

// ---------- mutations ----------

const kindOf = (id: string) => id.slice(0, Math.max(id.indexOf(":"), 0))

// Project ids carry their directory.
const isProjectId = (id: string) => kindOf(id) === "project" || kindOf(id) === "project-command"

const projectDirFromId = (id: string) => {
  const body = id.slice(id.indexOf(":") + 1)
  const cut = body.lastIndexOf(":")
  return cut > 0 ? body.slice(0, cut) : null
}

const notFound = new SkillError({ message: "That skill was not found. Refresh the list and try again." })

// ---------- service ----------

export interface SkillsShape {
  readonly list: (projectDirs: ReadonlyArray<string>) => Effect.Effect<SkillsListing>
  readonly setState: (
    input: { readonly id: string; readonly state: SkillState },
    projectDirs: ReadonlyArray<string>,
  ) => Effect.Effect<SkillsListing, SkillError>
  readonly setPlugin: (
    input: { readonly id: string; readonly enabled: boolean },
    projectDirs: ReadonlyArray<string>,
  ) => Effect.Effect<SkillsListing, SkillError>
  readonly restore: (input: { readonly id: string }, projectDirs: ReadonlyArray<string>) => Effect.Effect<SkillsListing, SkillError>
}

const make = (home: string): SkillsShape => {
  const list = (projectDirs: ReadonlyArray<string>) => Effect.sync(() => collect(home, projectDirs).result)

  const setState = Effect.fn("Skills.setState")(function* (
    input: { readonly id: string; readonly state: SkillState },
    projectDirs: ReadonlyArray<string>,
  ) {
    const { id, state } = input
    const dirs = [...projectDirs]
    const projectDir = isProjectId(id) ? projectDirFromId(id) : null
    if (projectDir) dirs.push(projectDir)

    const row = collect(home, dirs).result.skills.find((r) => r.id === id)
    if (!row) return yield* notFound
    if (row.source === "plugin") return yield* new SkillError({ message: "Plugin skills are turned on or off with their plugin." })
    if (row.source === "parked") return yield* new SkillError({ message: "This skill is parked. Restore it before changing its state." })
    const file = projectDir ? projectLocalPath(projectDir) : userSettingsPath(home)
    yield* mutateSettingsMap(file, "skillOverrides", row.name, state === "on" ? undefined : state)

    // A lower layer can snap it back.
    let after = collect(home, dirs).result
    let row2 = after.skills.find((r) => r.id === id)
    if (row2 && row2.state !== state) {
      yield* mutateSettingsMap(file, "skillOverrides", row.name, state)
      after = collect(home, dirs).result
      row2 = after.skills.find((r) => r.id === id)
      if (row2 && row2.state !== state) {
        after.warnings.push(
          `"${row.name}" is still ${row2.state} because ${row2.settingsFile ?? "another settings file"} overrides it. Edit that file to change it.`,
        )
      }
    }
    return after
  })

  const setPlugin = Effect.fn("Skills.setPlugin")(function* (
    input: { readonly id: string; readonly enabled: boolean },
    projectDirs: ReadonlyArray<string>,
  ) {
    let pluginId = input.id
    if (kindOf(pluginId) === "plugin") pluginId = pluginId.slice("plugin:".length).split(":")[0] ?? ""
    const { pluginIds } = collect(home, projectDirs)
    if (!pluginId || !pluginIds.has(pluginId)) {
      return yield* new SkillError({ message: "That plugin was not found. Refresh the list and try again." })
    }
    yield* mutateSettingsMap(userSettingsPath(home), "enabledPlugins", pluginId, input.enabled)
    return collect(home, projectDirs).result
  })

  const restore = Effect.fn("Skills.restore")(function* (input: { readonly id: string }, projectDirs: ReadonlyArray<string>) {
    if (kindOf(input.id) !== "parked") return yield* new SkillError({ message: "Only parked skills can be restored." })
    const dirName = input.id.slice("parked:".length)
    if (!dirName || dirName !== path.basename(dirName) || dirName === "." || dirName === "..") return yield* notFound
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
  // A parameter so tests can fake it.
  static readonly layerFor = (home: string) => Layer.succeed(Skills, make(path.resolve(home)))
  static readonly layer = Skills.layerFor(os.homedir())
}
