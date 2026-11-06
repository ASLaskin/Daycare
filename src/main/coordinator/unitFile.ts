// Atomic rewrite of a supervisor file, only when its text changed.

import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const current = (file: string): string | null => {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return null
  }
}

// True when the file was written
export const writeIfChanged = (file: string, text: string) => {
  const link = lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
  if (!link && current(file) === text) {
    return false
  }
  mkdirSync(path.dirname(file), { recursive: true })
  rmSync(file, { force: true })
  writeFileSync(file, text)
  return true
}
