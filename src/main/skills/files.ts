// Safe readers for JSON and markdown files.

import { Schema } from "effect"
import fs from "node:fs"
import path from "node:path"
import { isJsonObject, type Json, type JsonObject } from "../../shared/json.ts"
import { type Frontmatter, parseFrontmatter } from "./frontmatter.ts"

const MAX_SKILL_BYTES = 1024 * 1024

export type Warnings = Array<string>

export interface MdFile {
  readonly text: string
  readonly data: Frontmatter
}

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

// Error code or message from a caught error
export const codeOf = (err: unknown) => {
  if (!(err instanceof Error)) {
    return String(err)
  }
  return "code" in err && typeof err.code === "string" ? err.code : err.message
}

export const lstatOrNull = (p: string) => {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

export const readDirSafe = (dir: string, warnings: Warnings, quietIfMissing: boolean) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    if (!(quietIfMissing && codeOf(err) === "ENOENT")) {
      warnings.push(`Cannot read ${dir}: ${codeOf(err)}`)
    }
    return null
  }
}

// Settings JSON, tolerating a BOM and empty files.
export const parseSettingsText = (raw: string): Json => {
  const text = raw.replace(/^﻿/, "")
  return text.trim() ? decodeJsonText(text) : {}
}

export const readJson = (file: string, warnings: Warnings): JsonObject | null => {
  let raw: string
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch (err) {
    if (codeOf(err) !== "ENOENT") {
      warnings.push(`Cannot read ${file}: ${codeOf(err)}`)
    }
    return null
  }
  try {
    const parsed = parseSettingsText(raw)
    if (isJsonObject(parsed)) {
      return parsed
    }
    warnings.push(`${file} is not a JSON object`)
  } catch {
    warnings.push(`${file} is not valid JSON`)
  }
  return null
}

// Markdown file with frontmatter, size checked on the link target.
export const readMdFile = (file: string, warnings: Warnings): MdFile | null => {
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

export const readSkillFile = (dir: string, warnings: Warnings) => {
  const file = path.join(dir, "SKILL.md")
  if (!lstatOrNull(file)) {
    warnings.push(`Skipped ${dir}: no SKILL.md`)
    return null
  }
  return readMdFile(file, warnings)
}
