import type { Layout } from "../shared/settings.ts"
import { SIDEBAR_WIDTH } from "./appearance.ts"
import { $, el } from "./dom.ts"
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

// Columns default to an even share unless dragged.
export const splitFor = (layout: Layout, workers: number) => {
  const saved = settings().splits[layout]
  if (saved !== undefined && Number.isFinite(saved)) return saved
  if (layout === "columns") return Math.round(100 / (workers + 1))
  return layoutOf(layout).split
}

const workerCols = (layout: Layout, n: number) => {
  const max = Math.max(1, settings().maxCols || 4)
  if (!n) return 1
  if (layout === "side") return 1
  if (layout === "columns") return n
  if (layout === "grid") return Math.min(max, Math.ceil(Math.sqrt(n + 1)))
  return n <= max ? n : Math.min(max, Math.ceil(n / 2))
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

// Saved on pointer up, not every move.
export const wireSplitHandle = (g: HTMLElement, handle: HTMLElement) => {
  let drag: { vertical: boolean; rect: DOMRect; pct: number | null } | null = null
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    const layout = currentLayout()
    if (layout === "grid") return
    const vertical = layout === "stack"
    drag = { vertical, rect: g.getBoundingClientRect(), pct: null }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add(vertical ? "resizing-row" : "resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return
    const { rect, vertical } = drag
    const raw = vertical ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width
    drag.pct = Math.round(Math.min(85, Math.max(15, raw * 100)))
    g.style.setProperty("--split", `${drag.pct}%`)
  })
  const end = () => {
    if (!drag) return
    const pct = drag.pct
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing", "resizing-row")
    fitAll()
    if (pct != null) saveSettings({ splits: { ...settings().splits, [currentLayout()]: pct } })
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => {
    const splits = { ...settings().splits }
    delete splits[currentLayout()]
    saveSettings({ splits }).then(relayoutAll)
  })
}

export const setLayout = (id: Layout) => {
  if (id === currentLayout()) return
  saveSettings({ layout: id }).then(() => {
    relayoutAll()
    toast(`${layoutOf(id).label} layout`)
  })
}

// Static markup only, never user text.
const LAYOUT_ICONS: Record<Layout, string> = {
  stack:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="9" width="5.2" height="4.5" rx="1"/></svg>',
  side: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="5.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  columns:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="3.2" height="11" rx="1"/><rect x="6.4" y="2.5" width="3.2" height="11" rx="1"/><rect x="10.8" y="2.5" width="3.2" height="11" rx="1"/></svg>',
  grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="2.5" width="5.2" height="4.5" rx="1"/><rect x="2" y="9" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="9" width="5.2" height="4.5" rx="1"/></svg>',
}

const renderLayoutPicker = () => {
  const host = $("#layout-picker")
  host.replaceChildren()
  const cur = currentLayout()
  for (const l of LAYOUTS) {
    const b = el("button")
    b.type = "button"
    b.innerHTML = LAYOUT_ICONS[l.id]
    b.title = `${l.label}: ${l.sub.toLowerCase()}`
    b.setAttribute("aria-pressed", String(l.id === cur))
    b.setAttribute("aria-label", l.label)
    b.onclick = () => setLayout(l.id)
    host.append(b)
  }
}

export const layoutDiagram = (id: Layout) => {
  const d = el("span", "diagram")
  d.dataset["layout"] = id
  for (let i = 0; i < 4; i++) d.append(el("span", i === 0 ? "m" : null))
  return d
}

export const initSidebarResize = () => {
  const handle = $("#sidebar-handle")
  let drag: { w: number | null } | null = null
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    drag = { w: null }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add("resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return
    drag.w = Math.round(Math.min(460, Math.max(200, e.clientX)))
    document.documentElement.style.setProperty("--sidebar-w", `${drag.w}px`)
  })
  const end = () => {
    if (!drag) return
    const w = drag.w
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing")
    fitAll()
    if (w != null) saveSettings({ sidebarWidth: w })
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => saveSettings({ sidebarWidth: SIDEBAR_WIDTH }).then(fitAll))
}
