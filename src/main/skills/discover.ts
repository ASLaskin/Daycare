// Finds skill folders and command files on disk.

import fs from "node:fs"
import path from "node:path"
import { asDirPath, type DirPath } from "../../shared/ids.ts"
import { codeOf, lstatOrNull, readDirSafe, type Warnings } from "./files.ts"

export interface ChildDir {
  readonly name: string
  readonly dir: DirPath
  // Path the folder was found at, before resolving links.
  readonly viaPath: string
  readonly symlink: boolean
}

export interface CommandFile {
  readonly file: string
  readonly dir: DirPath
  readonly rel: string
  readonly base: string
  readonly symlink: boolean
}

// Resolved link target folder, or null with a warning.
const linkedDir = (full: string, warnings: Warnings): string | null => {
  try {
    const resolved = fs.realpathSync(full)
    if (fs.statSync(resolved).isDirectory()) {
      return resolved
    }
    warnings.push(`Skipped ${full}: link does not point to a folder`)
  } catch (err) {
    warnings.push(`Skipped ${full}: ${codeOf(err) === "ELOOP" ? "link loops back on itself" : "broken link, its target is missing"}`)
  }
  return null
}

// Direct subfolders, following links to folders.
export const childDirs = (root: string, warnings: Warnings, quietIfMissing: boolean): Array<ChildDir> =>
  (readDirSafe(root, warnings, quietIfMissing) ?? []).flatMap((e): Array<ChildDir> => {
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      return [{ name: e.name, dir: asDirPath(full), viaPath: full, symlink: false }]
    }
    if (!e.isSymbolicLink()) {
      return []
    }
    const resolved = linkedDir(full, warnings)
    return resolved ? [{ name: e.name, dir: asDirPath(resolved), viaPath: full, symlink: true }] : []
  })

// Skill folders up to a depth, not descending into skills.
export const findSkillDirs = (root: string, maxDepth: number, warnings: Warnings) => {
  const visited = new Set<string>()
  const walk = (dir: string, depth: number): Array<ChildDir> =>
    childDirs(dir, warnings, true).flatMap((child) => {
      if (visited.has(child.dir)) {
        return []
      }
      visited.add(child.dir)
      if (lstatOrNull(path.join(child.dir, "SKILL.md"))) {
        return [child]
      }
      return depth < maxDepth ? walk(child.dir, depth + 1) : []
    })
  return walk(root, 1)
}

// File and folder flags, following links.
const kindOf = (full: string, e: fs.Dirent, warnings: Warnings): { isFile: boolean; isDir: boolean } | null => {
  if (!e.isSymbolicLink()) {
    return { isFile: e.isFile(), isDir: e.isDirectory() }
  }
  try {
    const st = fs.statSync(full)
    return { isFile: st.isFile(), isDir: st.isDirectory() }
  } catch {
    warnings.push(`Skipped ${full}: broken link, its target is missing`)
    return null
  }
}

// Markdown commands, plus one level of namespaced folders.
export const findCommandFiles = (dir: string, warnings: Warnings) => {
  const scan = (d: string, prefix: string, quiet: boolean, canDescend: boolean): Array<CommandFile> =>
    (readDirSafe(d, warnings, quiet) ?? []).flatMap((e): Array<CommandFile> => {
      const full = path.join(d, e.name)
      const kind = kindOf(full, e, warnings)
      if (!kind) {
        return []
      }
      if (kind.isFile && e.name.endsWith(".md")) {
        const base = e.name.slice(0, -3)
        return [{ file: full, dir: asDirPath(d), rel: prefix + base, base, symlink: e.isSymbolicLink() }]
      }
      return kind.isDir && canDescend ? scan(full, `${prefix}${e.name}/`, false, false) : []
    })
  return scan(dir, "", true, true)
}
