import { el } from "../dom.ts"
import { focused } from "../focus.ts"
import { onFocusChanged, onSettingsChanged, settings } from "../store.ts"
import { onRailKey, renderRailList } from "./rail-list.ts"
import { applyRailWidth, wireRailHandle } from "./rail-resize.ts"
import { rail, saveRail } from "./rail-state.ts"
import { onRender, refresh, store } from "./state.ts"

const applyRailOpen = () => {
  if (!rail.els) {
    return
  }
  applyRailWidth()
  rail.els.root.classList.toggle("open", rail.open)
  rail.els.strip.setAttribute("aria-expanded", String(rail.open))
  rail.els.strip.title = rail.open ? "Hide skills" : "Show skills: click one to type its command into the focused session"
}

const setRailOpen = (open: boolean) => {
  rail.open = open
  applyRailOpen()
  if (open) {
    rail.els?.search.focus()
  }
  rail.saving++
  void saveRail({ skillRailOpen: open }).then(() => {
    rail.saving--
  })
}

const renderRailHead = () => {
  if (!rail.els) {
    return
  }
  const { session } = rail.els
  const f = focused()
  session.replaceChildren()
  session.classList.toggle("quiet", !f)
  if (!f) {
    session.append(el("span", "sr-session-name", "Focus a session"))
    session.title = "Click a terminal or chat first, then pick a skill."
    return
  }
  session.append(el("span", "sr-session-label", "Typing into"), el("span", "sr-session-name", f.name || "Session"))
  session.title = f.name || ""
}

const renderRail = () => {
  if (!rail.els) {
    return
  }
  applyRailOpen()
  renderRailHead()
  renderRailList()
}

const searchField = () => {
  const search = el("input", "sr-search")
  search.type = "text"
  search.placeholder = "Search skills"
  search.setAttribute("aria-label", "Search skills to insert")
  search.value = rail.query
  search.oninput = () => {
    rail.query = search.value
    rail.activeId = null
    renderRailList()
  }
  search.onkeydown = onRailKey
  return search
}

// Collapsible panel that types skill commands into the focused session
export const mountRail = (host: HTMLElement) => {
  host.replaceChildren()
  rail.open = settings().skillRailOpen

  const root = el("div", "skill-rail")
  const strip = el("button", "sr-strip")
  strip.type = "button"
  const count = el("span", "sr-strip-count")
  strip.append(el("span", "sr-chev"), el("span", "sr-strip-label", "Skills"), count)
  strip.onclick = () => setRailOpen(!rail.open)

  const panel = el("div", "sr-panel")
  const handle = el("div", "sr-handle")
  handle.title = "Drag to resize. Double-click to reset."
  const head = el("div", "sr-head")
  const session = el("div", "sr-session")
  head.append(session)
  const search = searchField()
  const list = el("div", "sr-list")
  list.setAttribute("role", "listbox")
  const foot = el("div", "sr-foot")
  const msg = el("div", "sr-msg")
  foot.append(msg, el("div", "hint", "Inserts the command without running it. Add arguments, then press Enter."))

  panel.append(handle, head, search, list, foot)
  root.append(strip, panel)
  host.append(root)
  rail.els = { root, strip, session, search, list, msg, count }
  wireRailHandle(handle, root)
  renderRail()
  if (!store.data) {
    void refresh()
  }
}

onRender(renderRail)

// Follow open state saved from elsewhere
onSettingsChanged(() => {
  if (!rail.els) {
    return
  }
  applyRailWidth()
  const open = settings().skillRailOpen
  if (!rail.saving && open !== rail.open) {
    rail.open = open
    applyRailOpen()
  }
})

onFocusChanged(() => {
  renderRailHead()
  renderRailList()
})
