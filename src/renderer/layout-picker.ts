// Toolbar layout buttons and settings diagrams.

import type { Layout } from "../shared/settings.ts"
import { el, $ } from "./dom.ts"
import { currentLayout, LAYOUTS, setLayout } from "./layout.ts"

// Static SVG markup for each preset.
const LAYOUT_ICONS: Record<Layout, string> = {
  stack:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="9" width="5.2" height="4.5" rx="1"/></svg>',
  side: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="5.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  columns:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="3.2" height="11" rx="1"/><rect x="6.4" y="2.5" width="3.2" height="11" rx="1"/><rect x="10.8" y="2.5" width="3.2" height="11" rx="1"/></svg>',
  grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.5" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="2.5" width="5.2" height="4.5" rx="1"/><rect x="2" y="9" width="5.2" height="4.5" rx="1"/><rect x="8.8" y="9" width="5.2" height="4.5" rx="1"/></svg>',
}

export const renderLayoutPicker = () => {
  const cur = currentLayout()
  $("#layout-picker").replaceChildren(
    ...LAYOUTS.map((l) => {
      const b = el("button")
      b.type = "button"
      b.innerHTML = LAYOUT_ICONS[l.id]
      b.title = `${l.label}: ${l.sub.toLowerCase()}`
      b.setAttribute("aria-pressed", String(l.id === cur))
      b.setAttribute("aria-label", l.label)
      b.onclick = () => setLayout(l.id)
      return b
    }),
  )
}

export const layoutDiagram = (id: Layout) => {
  const d = el("span", "diagram")
  d.dataset["layout"] = id
  d.append(...[0, 1, 2, 3].map((i) => el("span", i === 0 ? "m" : null)))
  return d
}
