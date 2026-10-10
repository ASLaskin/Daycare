import { el } from "../dom.ts"
import { focused } from "../focus.ts"
import { onFocusChanged } from "../store.ts"
import { onRailKey, renderRailList } from "./rail-list.ts"
import { rail } from "./rail-state.ts"
import { onRender, refresh, store } from "./state.ts"

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
    session.title = "Click a chat first, then pick a skill."
    return
  }
  session.append(el("span", "sr-session-label", "Typing into"), el("span", "sr-session-name", f.name || "Session"))
  session.title = f.name || ""
}

const renderRail = () => {
  if (!rail.els) {
    return
  }
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

export const focusSkillSearch = () => rail.els?.search.focus()

// Types skill commands into the focused session
export const mountSkillsPage = (host: HTMLElement) => {
  const head = el("div", "sr-head")
  const session = el("div", "sr-session")
  head.append(session)
  const search = searchField()
  const list = el("div", "sr-list")
  list.setAttribute("role", "listbox")
  const foot = el("div", "sr-foot")
  const msg = el("div", "sr-msg")
  foot.append(msg, el("div", "hint", "Inserts the command without running it. Add arguments, then press Enter."))

  host.append(head, search, list, foot)
  rail.els = { session, search, list, msg }
  renderRail()
  if (!store.data) {
    void refresh()
  }
}

onRender(renderRail)

onFocusChanged(() => {
  renderRailHead()
  renderRailList()
})
