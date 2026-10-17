// Keychain item Claude Code keeps an account's OAuth token in.

import { createHash } from "node:crypto"
import type { DirPath } from "../../shared/ids.ts"

const SERVICE = "Claude Code-credentials"

// Custom config dirs get a hash suffix, matching Claude Code
export const keychainService = (configDir: DirPath | null) => {
  if (!configDir) {
    return SERVICE
  }
  const hash = createHash("sha256").update(configDir.normalize("NFC")).digest("hex").slice(0, 8)
  return `${SERVICE}-${hash}`
}
