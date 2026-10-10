// Rail width, dragged from the panel's left edge.

import { settings } from "../store.ts"
import { RAIL_DEFAULT_WIDTH, saveRail } from "./state.ts"

const MIN_WIDTH = 200
const MAX_WIDTH = 480

export const applyRailWidth = (root: HTMLElement) => {
  const w = settings().railWidth
  const px = Number.isFinite(w) && w >= MIN_WIDTH ? Math.min(MAX_WIDTH, w) : RAIL_DEFAULT_WIDTH
  root.style.setProperty("--sr-panel", `${px}px`)
}

export const wireRailHandle = (handle: HTMLElement, root: HTMLElement) => {
  let drag: { w: number | null; right: number } | null = null
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) {
      return
    }
    drag = { w: null, right: root.getBoundingClientRect().right }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add("resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) {
      return
    }
    drag.w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.right - e.clientX)))
    root.style.setProperty("--sr-panel", `${drag.w}px`)
  })
  const end = () => {
    if (!drag) {
      return
    }
    const w = drag.w
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing")
    if (w != null) {
      void saveRail({ railWidth: w })
    }
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => void saveRail({ railWidth: RAIL_DEFAULT_WIDTH }))
}
