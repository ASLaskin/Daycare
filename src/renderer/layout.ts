// Layout presets and how a group applies them.

import type { Layout } from "../shared/settings.ts"
import { renderLayoutPicker } from "./layout-picker.ts"
import { saveSettings, settings } from "./store.ts"
import { toast } from "./toast.ts"

export interface LayoutPreset {
  readonly id: Layout
  readonly label: string
  readonly sub: string
  readonly split: number
}

export const LAYOUTS: ReadonlyArray<LayoutPreset> = [
  { id: "stack", label: "Stack", sub: "Master on top, workers in columns below", split: 44 },
  { id: "side", label: "Side by side", sub: "Master on the left, workers stacked on the right", split: 50 },
  { id: "columns", label: "Columns", sub: "Every session side by side", split: 0 },
  { id: "grid", label: "Grid", sub: "Every session the same size", split: 0 },
]

const layoutOf = (id: Layout) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]!
export const currentLayout = () => layoutOf(settings().layout).id

// Master share in percent; columns default to even.
export const splitFor = (layout: Layout, workers: number) => {
  const saved = settings().splits[layout]
  if (saved !== undefined && Number.isFinite(saved)) {
    return saved
  }
  return layout === "columns" ? Math.round(100 / (workers + 1)) : layoutOf(layout).split
}

// Cells counts every shown pane, master included.
const COLS: Record<Layout, (n: number, max: number, cells: number) => number> = {
  side: () => 1,
  columns: (n) => n,
  grid: (_n, max, cells) => Math.min(max, Math.ceil(Math.sqrt(cells))),
  stack: (n, max) => (n <= max ? n : Math.min(max, Math.ceil(n / 2))),
}

const workerCols = (layout: Layout, n: number, cells: number) => {
  if (!n) {
    return 1
  }
  return COLS[layout](n, Math.max(1, settings().maxCols || 4), cells)
}

const shownPanes = (slot: Element) => slot.querySelectorAll(":scope > .pane:not(.collapsed)").length

// Counts shown panes only.
export const applyLayout = (g: HTMLElement) => {
  const layout = currentLayout()
  const grid = g.querySelector(".worker-grid")!
  const n = shownPanes(grid)
  const master = shownPanes(g.querySelector(".master-slot")!)
  g.dataset["layout"] = layout
  g.classList.toggle("has-workers", grid.children.length > 0)
  g.classList.toggle("workers-shown", n > 0)
  g.classList.toggle("master-hidden", !master)
  g.style.setProperty("--split", `${splitFor(layout, n)}%`)
  g.style.setProperty("--cols", String(workerCols(layout, n, n + master)))
}

export const relayoutAll = () => {
  document.querySelectorAll<HTMLElement>(".group").forEach(applyLayout)
  document.documentElement.style.setProperty("--stage-gap", `${settings().stageGap || 10}px`)
  renderLayoutPicker()
}

export const setLayout = (id: Layout) => {
  if (id === currentLayout()) {
    return
  }
  saveSettings({ layout: id }).then(() => {
    relayoutAll()
    toast(`${layoutOf(id).label} layout`)
  })
}
