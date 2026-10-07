// Temporary coordinator databases and sample sessions.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { openStore } from "../../src/coordinator/store.ts"
import type { Provider, SessionState, StoredSession } from "../../src/shared/coordinator.ts"
import { asDirPath, asFilePath, asSessionId } from "../../src/shared/ids.ts"

// Database file in its own temp directory; remove() deletes both
export const tempDb = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "daycare-db-"))
  const file = asFilePath(path.join(dir, "coordinator.db"))
  return { file, open: () => openStore(file), remove: () => rmSync(dir, { recursive: true, force: true }) }
}

export const sample = (id: string, provider: Provider, state: SessionState): StoredSession => ({
  id: asSessionId(id),
  provider,
  nativeId: null,
  role: "master",
  parentId: null,
  name: id,
  icon: null,
  cwd: asDirPath("/tmp"),
  model: null,
  permissionMode: "default",
  state,
  closed: false,
  error: null,
  createdAt: 1,
  run: 0,
})
