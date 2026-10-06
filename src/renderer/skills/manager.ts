import { el } from "../dom.ts"
import { renderList, visibleGroupKeys } from "./manager-list.ts"
import { GROUPS, mgr, type Sort } from "./manager-state.ts"
import { renderSummary, renderWarnings } from "./manager-summary.ts"
import { onRender, refresh } from "./state.ts"

const SEARCH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.3 10.3L13.5 13.5"/></svg>'

const SORTS: ReadonlyArray<readonly [Sort, string, string]> = [
  ["tokens", "Most tokens", "Most expensive first"],
  ["name", "Name", "Alphabetical"],
]

const searchBox = () => {
  const search = el("input", "sm-search")
  search.type = "text"
  search.placeholder = "Search by name, description or folder"
  search.setAttribute("aria-label", "Search skills")
  search.value = mgr.query
  search.oninput = () => {
    mgr.query = search.value
    renderList()
  }
  search.onkeydown = (e) => {
    if (e.key === "Escape" && search.value) {
      e.stopPropagation()
      search.value = ""
      mgr.query = ""
      renderList()
    }
  }
  const wrap = el("div", "sm-search-wrap")
  wrap.innerHTML = SEARCH_ICON
  wrap.append(search)
  return wrap
}

const sortButtons = () => {
  const seg = el("div", "seg sm-seg")
  seg.setAttribute("role", "group")
  seg.setAttribute("aria-label", "Sort skills")
  const sortBtns = new Map<Sort, HTMLButtonElement>()
  SORTS.forEach(([key, label, title]) => {
    const b = el("button", "ghost", label)
    b.type = "button"
    b.title = title
    b.onclick = () => {
      mgr.sort = key
      renderList()
    }
    sortBtns.set(key, b)
    seg.append(b)
  })
  return { seg, sortBtns }
}

// Collapse every group, or expand all when all are closed
const foldButton = () => {
  const foldBtn = el("button", "ghost sm-fold")
  foldBtn.type = "button"
  foldBtn.onclick = () => {
    const open = visibleGroupKeys().some((k) => !mgr.collapsed.has(k))
    mgr.collapsed = open ? new Set(GROUPS.map((g) => g.key)) : new Set()
    renderList()
  }
  return foldBtn
}

const renderManager = () => {
  if (!mgr.els) {
    return
  }
  renderSummary(mgr.els.summary)
  renderList()
  renderWarnings(mgr.els.warn)
}

// Settings > Skills view
export const mountManager = (host: HTMLElement) => {
  host.replaceChildren()
  host.classList.add("skills-manager")
  const summary = el("div", "sm-summary card highlight")
  const { seg, sortBtns } = sortButtons()
  const foldBtn = foldButton()
  const bar = el("div", "sm-toolbar")
  bar.append(searchBox(), seg, foldBtn)
  const list = el("div", "sm-groups")
  const warn = el("div", "sm-warnings")
  host.append(summary, bar, list, warn)
  mgr.els = { host, summary, list, warn, foldBtn, sortBtns }
  renderManager()
  void refresh()
}

onRender(renderManager)
