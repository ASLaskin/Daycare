// Draggable sidebar edge.

import { SIDEBAR_WIDTH } from "./appearance.ts"
import { $ } from "./dom.ts"
import { fitAll } from "./state.ts"
import { saveSettings } from "./store.ts"

export const initSidebarResize = () => {
  const handle = $("#sidebar-handle")
  let drag: { w: number | null } | null = null
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) {
      return
    }
    drag = { w: null }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add("resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) {
      return
    }
    drag.w = Math.round(Math.min(460, Math.max(200, e.clientX)))
    document.documentElement.style.setProperty("--sidebar-w", `${drag.w}px`)
  })
  const end = () => {
    if (!drag) {
      return
    }
    const w = drag.w
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing")
    fitAll()
    if (w != null) {
      saveSettings({ sidebarWidth: w })
    }
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => saveSettings({ sidebarWidth: SIDEBAR_WIDTH }).then(fitAll))
}
