// Header button that collapses a pane into its group tray.

import type { SessionId } from "../shared/ids.ts"
import { collapse } from "./collapse.ts"
import { el } from "./dom.ts"

// Static SVG markup for the collapse button.
const ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 11.5h9"/></svg>'

export const collapseButton = (id: SessionId) => {
  const b = el("button", "icon-btn icon-collapse")
  b.type = "button"
  b.title = "Collapse into the tray (Alt+double-click the header)"
  b.innerHTML = ICON
  b.onclick = (e) => {
    e.stopPropagation()
    collapse(id)
  }
  return b
}
