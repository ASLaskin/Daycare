// Draggable gap between master and workers.

import { currentLayout, relayoutAll } from "./layout.ts"
import { saveSettings, settings } from "./store.ts"

interface Drag {
  readonly vertical: boolean
  readonly rect: DOMRect
  pct: number | null
}

const dragPercent = ({ rect, vertical }: Drag, e: PointerEvent) => {
  const raw = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width
  return Math.round(Math.min(85, Math.max(15, raw * 100)))
}

// Saves the split on pointer up only.
export const wireSplitHandle = (g: HTMLElement, handle: HTMLElement) => {
  let drag: Drag | null = null
  handle.addEventListener("pointerdown", (e) => {
    const layout = currentLayout()
    if (e.button !== 0 || layout === "grid") {
      return
    }
    const vertical = layout === "stack"
    drag = { vertical, rect: g.getBoundingClientRect(), pct: null }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add(vertical ? "resizing-row" : "resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) {
      return
    }
    drag.pct = dragPercent(drag, e)
    g.style.setProperty("--split", `${drag.pct}%`)
  })
  const end = () => {
    if (!drag) {
      return
    }
    const pct = drag.pct
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing", "resizing-row")
    if (pct != null) {
      saveSettings({ splits: { ...settings().splits, [currentLayout()]: pct } })
    }
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => {
    const splits = { ...settings().splits }
    delete splits[currentLayout()]
    saveSettings({ splits }).then(relayoutAll)
  })
}
