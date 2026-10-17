// Personal Claude Code config every account shares with ~/.claude.

import fs from "node:fs"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"

export const SHARED_ENTRIES = ["CLAUDE.md", "settings.json", "skills", "agents", "commands", "plugins", "output-styles", "keybindings.json"]

const exists = (p: string) => {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

// Symlinks shared entries the account dir lacks
export const linkSharedConfig = (home: string, configDir: DirPath) => {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  SHARED_ENTRIES.map((name) => ({ from: path.join(home, ".claude", name), to: path.join(configDir, name) }))
    .filter(({ from, to }) => fs.existsSync(from) && !exists(to))
    .forEach(({ from, to }) => fs.symlinkSync(from, to))
}
