// Layout presets and how a group applies them.

import type { Layout } from "../shared/settings.ts"
import { renderLayoutPicker } from "./layout-picker.ts"
import { fitAll } from "./state.ts"
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

const COLS: Record<Layout, (n: number, max: number) => number> = {
  side: () => 1,
  columns: (n) => n,
  grid: (n, max) => Math.min(max, Math.ceil(Math.sqrt(n + 1))),
  stack: (n, max) => (n <= max ? n : Math.min(max, Math.ceil(n / 2))),
}

const workerCols = (layout: Layout, n: number) => {
  if (!n) {
    return 1
  }
  return COLS[layout](n, Math.max(1, settings().maxCols || 4))
}

export const applyLayout = (g: HTMLElement) => {
  const layout = currentLayout()
  const n = g.querySelector(".worker-grid")!.children.length
  g.dataset["layout"] = layout
  g.style.setProperty("--split", `${splitFor(layout, n)}%`)
  g.style.setProperty("--cols", String(workerCols(layout, n)))
}

export const relayoutAll = () => {
  document.querySelectorAll<HTMLElement>(".group").forEach(applyLayout)
  document.documentElement.style.setProperty("--stage-gap", `${settings().stageGap || 10}px`)
  fitAll()
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
