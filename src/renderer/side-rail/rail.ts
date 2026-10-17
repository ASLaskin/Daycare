import type { RailTab } from "../../shared/settings.ts"
import { el } from "../dom.ts"
import { onSettingsChanged, settings } from "../store.ts"
import { PAGES } from "./pages.ts"
import { applyRailWidth, wireRailHandle } from "./resize.ts"
import { saveRail, sideRail } from "./state.ts"

const apply = () => {
  const els = sideRail.els
  if (!els) {
    return
  }
  applyRailWidth(els.root)
  els.root.classList.toggle("open", sideRail.open)
  els.bodies.forEach((body, id) => body.classList.toggle("on", id === sideRail.tab))
  ;[...els.tabs.children]
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .forEach((b) => {
      const on = sideRail.open && b.dataset["tab"] === sideRail.tab
      b.setAttribute("aria-pressed", String(on))
      b.title = on ? "Hide panel" : ""
    })
}

const show = (tab: RailTab, open: boolean) => {
  const revealed = open && (!sideRail.open || sideRail.tab !== tab)
  sideRail.open = open
  sideRail.tab = tab
  apply()
  if (revealed) {
    PAGES.find((p) => p.id === tab)?.shown?.()
  }
}

// Clicking the active tab closes the rail
const choose = (tab: RailTab) => {
  const open = !(sideRail.open && sideRail.tab === tab)
  show(tab, open)
  sideRail.saving++
  void saveRail({ railOpen: open, railTab: tab }).then(() => {
    sideRail.saving--
  })
}

const tabButton = (id: RailTab, label: string) => {
  const b = el("button", null, label)
  b.type = "button"
  b.dataset["tab"] = id
  b.onclick = () => choose(id)
  return b
}

// Right edge tab strip opening one page at a time
export const mountSideRail = (root: HTMLElement) => {
  root.replaceChildren()
  root.className = "side-rail"
  const handle = el("div", "sr-handle")
  handle.title = "Drag to resize. Double-click to reset."
  const tabs = el("div", "sr-tabs")
  tabs.setAttribute("role", "group")
  tabs.setAttribute("aria-label", "Panel")
  tabs.append(...PAGES.map((p) => tabButton(p.id, p.label)))
  const bodies = new Map(PAGES.map((p) => [p.id, el("div", `sr-body ${p.className}`)] as const))
  const panel = el("div", "sr-panel")
  panel.append(handle, ...bodies.values())
  root.append(panel, tabs)
  sideRail.els = { root, tabs, bodies }
  PAGES.forEach((p) => {
    const body = bodies.get(p.id)
    if (body) {
      p.mount(body)
    }
  })
  wireRailHandle(handle, root)
  show(settings().railTab, settings().railOpen)
}

// Follow state saved from elsewhere
onSettingsChanged(() => {
  if (!sideRail.els) {
    return
  }
  if (sideRail.saving) {
    apply()
    return
  }
  show(settings().railTab, settings().railOpen)
})
