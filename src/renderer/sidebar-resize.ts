// Draggable sidebar edge.

import { SIDEBAR_WIDTH } from "./appearance.ts"
import { $ } from "./dom.ts"
import { wireDrag } from "./drag-handle.ts"
import { saveSettings } from "./store.ts"

export const initSidebarResize = () => {
  const handle = $("#sidebar-handle")
  wireDrag<{ w: number | null }>(handle, {
    start: () => ({ w: null }),
    bodyClass: () => "resizing",
    move: (drag, e) => {
      drag.w = Math.round(Math.min(460, Math.max(200, e.clientX)))
      document.documentElement.style.setProperty("--sidebar-w", `${drag.w}px`)
    },
    end: ({ w }) => {
      if (w != null) {
        saveSettings({ sidebarWidth: w })
      }
    },
  })
  handle.addEventListener("dblclick", () => saveSettings({ sidebarWidth: SIDEBAR_WIDTH }))
}
