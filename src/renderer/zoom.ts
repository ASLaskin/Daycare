// One pane filling the stage.

import type { SessionId } from "../shared/ids.ts"
import * as chat from "./chat/index.ts"
import { el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { fitAll, type Pane, panes } from "./state.ts"

// Static SVG markup for the zoom button.
const ICONS = {
  zoom: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>',
  unzoom:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5h-4v-4M9.5 6.5L14 2M2.5 9.5h4v4M6.5 9.5L2 14"/></svg>',
}
const ZOOM_TITLE = "Zoom this pane (double-click the header)"
const UNZOOM_TITLE = "Back to the layout (Esc)"

let zoomedId: SessionId | null = null

const setIcon = (p: Pane, name: keyof typeof ICONS, title: string) => {
  const btn = p.pane.querySelector<HTMLElement>(".icon-zoom")
  if (!btn) {
    return
  }
  btn.innerHTML = ICONS[name]
  btn.title = title
}

export const toggleZoom = (id: SessionId) => {
  const p = panes.get(id)
  if (!p) {
    return
  }
  const on = zoomedId !== id
  document.querySelectorAll(".pane.zoomed, .group.zoomed").forEach((x) => x.classList.remove("zoomed"))
  panes.forEach((x) => setIcon(x, "zoom", ZOOM_TITLE))
  zoomedId = on ? id : null
  if (on) {
    p.pane.closest(".group")?.classList.add("zoomed")
    p.pane.classList.add("zoomed")
    setIcon(p, "unzoom", UNZOOM_TITLE)
  }
  fitAll()
  focusSession(id)
}

export const zoomButton = (id: SessionId) => {
  const b = el("button", "icon-btn icon-zoom")
  b.type = "button"
  b.title = ZOOM_TITLE
  b.innerHTML = ICONS.zoom
  b.onclick = (e) => {
    e.stopPropagation()
    toggleZoom(id)
  }
  return b
}

// Leaves zoom unless a running chat owns Esc.
export const unzoom = () => {
  if (!zoomedId) {
    return
  }
  if (panes.get(zoomedId)?.isChat && chat.isRunning(zoomedId)) {
    return
  }
  toggleZoom(zoomedId)
}

export const releaseZoom = (p: Pane) => {
  if (zoomedId !== p.info.id) {
    return
  }
  zoomedId = null
  p.pane.closest(".group")?.classList.remove("zoomed")
}
