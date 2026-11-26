// Draggable gap between master and workers.

import { type DragPointer, wireDrag } from "./drag-handle.ts"
import { currentLayout, relayoutAll } from "./layout.ts"
import { saveSettings, settings } from "./store.ts"

interface Drag {
  readonly vertical: boolean
  readonly rect: DOMRect
  pct: number | null
}

const dragPercent = ({ rect, vertical }: Drag, e: DragPointer) => {
  const raw = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width
  return Math.round(Math.min(85, Math.max(15, raw * 100)))
}

// Saves the split on pointer up only.
export const wireSplitHandle = (g: HTMLElement, handle: HTMLElement) => {
  wireDrag<Drag>(handle, {
    start: () => {
      const layout = currentLayout()
      if (layout === "grid") {
        return null
      }
      return { vertical: layout === "stack", rect: (handle.parentElement ?? g).getBoundingClientRect(), pct: null }
    },
    bodyClass: ({ vertical }) => (vertical ? "resizing-row" : "resizing"),
    move: (drag, e) => {
      drag.pct = dragPercent(drag, e)
      g.style.setProperty("--split", `${drag.pct}%`)
    },
    end: ({ pct }) => {
      if (pct != null) {
        saveSettings({ splits: { ...settings().splits, [currentLayout()]: pct } })
      }
    },
  })
  handle.addEventListener("dblclick", () => {
    const splits = { ...settings().splits }
    delete splits[currentLayout()]
    saveSettings({ splits }).then(relayoutAll)
  })
}
