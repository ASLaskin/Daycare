// Setting workers aside and bringing them back.

import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import type { Session } from "./model.ts"

export const makeArchive = (core: Core, lifecycle: Lifecycle) => {
  // Stops a worker, keeping its record and transcript
  const archive = (w: Session) => {
    if (w.role !== "worker" || w.archived) {
      return
    }
    w.archived = true
    core.update(w)
    core.persist()
    lifecycle.closeSession(w)
  }

  // Resumes it when its master is open
  const unarchive = (w: Session) => {
    if (!w.archived) {
      return
    }
    w.archived = false
    const master = w.parentId ? core.masterById(w.parentId) : null
    if (master && master.status !== "closed" && !master.closing) {
      lifecycle.reopenSession(w)
    }
    core.update(w)
    core.persist()
  }

  return { archive, unarchive }
}
