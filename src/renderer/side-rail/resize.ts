// Rail width, dragged from the panel's left edge.

import { wireDrag } from "../drag-handle.ts"
import { settings } from "../store.ts"
import { RAIL_DEFAULT_WIDTH, saveRail } from "./state.ts"

const MIN_WIDTH = 200
// Room left for the stage
const STAGE_MIN = 320

const maxWidth = (root: HTMLElement) => Math.max(MIN_WIDTH, (root.parentElement?.clientWidth ?? window.innerWidth) - STAGE_MIN)

export const applyRailWidth = (root: HTMLElement) => {
  const w = settings().railWidth
  const px = Number.isFinite(w) && w >= MIN_WIDTH ? w : RAIL_DEFAULT_WIDTH
  root.style.setProperty("--sr-panel", `${px}px`)
}

interface RailDrag {
  w: number | null
  readonly right: number
  readonly max: number
}

export const wireRailHandle = (handle: HTMLElement, root: HTMLElement) => {
  wireDrag<RailDrag>(handle, {
    start: () => ({ w: null, right: root.getBoundingClientRect().right, max: maxWidth(root) }),
    bodyClass: () => "resizing",
    move: (drag, e) => {
      drag.w = Math.round(Math.min(drag.max, Math.max(MIN_WIDTH, drag.right - e.clientX)))
      root.style.setProperty("--sr-panel", `${drag.w}px`)
    },
    end: ({ w }) => {
      if (w != null) {
        void saveRail({ railWidth: w })
      }
    },
  })
  handle.addEventListener("dblclick", () => void saveRail({ railWidth: RAIL_DEFAULT_WIDTH }))
}
