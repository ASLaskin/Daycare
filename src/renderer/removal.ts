// Tearing down panes and groups.

import type { SessionId } from "../shared/ids.ts"
import * as chat from "./chat/index.ts"
import { clearFocus, releaseMaster } from "./focus.ts"
import { applyLayout } from "./layout.ts"
import { renderProjectActions } from "./project-actions.ts"
import { renderSidebar } from "./sidebar.ts"
import { panes, workersOf } from "./state.ts"
import { releaseZoom } from "./zoom.ts"

const removePane = (id: SessionId) => {
  const p = panes.get(id)
  if (!p) {
    return
  }
  releaseZoom(p)
  chat.dispose(id)
  p.pane.remove()
  panes.delete(id)
  clearFocus(id)
}

const removeMaster = (id: SessionId) => {
  workersOf(id).forEach((w) => removePane(w.id))
  removePane(id)
  document.getElementById(`group-${id}`)?.remove()
  releaseMaster(id)
}

const removeWorker = (id: SessionId, parentId: string | null) => {
  removePane(id)
  const g = parentId ? document.getElementById(`group-${parentId}`) : null
  if (!g) {
    return
  }
  g.classList.toggle("has-workers", g.querySelector(".worker-grid")!.children.length > 0)
  applyLayout(g)
}

export const removeSessionUI = ({ id, parentId }: { readonly id: SessionId; readonly parentId: SessionId | null }) => {
  const p = panes.get(id)
  if (!p) {
    renderSidebar()
    return
  }
  if (p.info.role === "master") {
    removeMaster(id)
  }
  if (p.info.role === "worker") {
    removeWorker(id, parentId)
  }
  renderProjectActions()
  renderSidebar()
}
