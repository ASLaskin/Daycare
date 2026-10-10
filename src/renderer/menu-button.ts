// Header button opening a session's actions menu.

import type { SessionId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"

// Static SVG markup for the three line menu icon.
const ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4.5h10M3 8h10M3 11.5h10"/></svg>'

export const menuButton = (id: SessionId) => {
  const b = el("button", "icon-btn icon-menu")
  b.type = "button"
  b.title = "Actions"
  b.setAttribute("aria-label", "Actions")
  b.innerHTML = ICON
  b.onclick = (e) => {
    e.stopPropagation()
    api.sessionMenu(id)
  }
  return b
}
