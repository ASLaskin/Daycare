// Config dir and child environment for each account.

import path from "node:path"
import { DEFAULT_ACCOUNT } from "../../shared/accounts.ts"
import { type AccountId, asDirPath, type DirPath } from "../../shared/ids.ts"

export const CONFIG_ENV = "CLAUDE_CONFIG_DIR"

// Isolated config dir, or null for Default (~/.claude)
export const configDirFor = (userData: string, id: AccountId): DirPath | null =>
  id === DEFAULT_ACCOUNT ? null : asDirPath(path.join(userData, "accounts", id.replace(/[^\w-]/g, "")))

// Folder Claude Code reads for an account
export const configHomeFor = (home: string, userData: string, id: AccountId): DirPath =>
  configDirFor(userData, id) ?? asDirPath(path.join(home, ".claude"))

// Env pointed at a config dir, or at ~/.claude when null
export const withConfigDir = (env: NodeJS.ProcessEnv, configDir: DirPath | null): NodeJS.ProcessEnv => {
  const { [CONFIG_ENV]: _inherited, ...rest } = env
  return configDir ? { ...rest, [CONFIG_ENV]: configDir } : rest
}
