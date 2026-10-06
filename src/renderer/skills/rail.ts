// Rail that types a slash command into the focused session.

import type { SkillRow } from "../../shared/skills.ts"
import { el } from "../dom.ts"
import { focused, insertIntoFocused } from "../sessions.ts"
import { onFocusChanged, onSettingsChanged, saveSettings, settings } from "../store.ts"
import { fmt, matches, onRender, refresh, store } from "./state.ts"

interface Els {
  root: HTMLElement
  strip: HTMLButtonElement
  session: HTMLElement
  search: HTMLInputElement
  list: HTMLElement
  msg: HTMLElement
  count: HTMLElement
}

let els: Els | null = null
const rail = {
  query: "",
  activeId: null as string | null,
  visible: [] as ReadonlyArray<SkillRow>,
  msgTimer: 0 as ReturnType<typeof setTimeout> | 0,
  open: false,
  saving: 0,
}

const DEFAULT_WIDTH = 252

export const mountRail = (host: HTMLElement) => {
  host.replaceChildren()
  rail.open = settings().skillRailOpen

  const root = el("div", "skill-rail")
  const strip = el("button", "sr-strip")
  strip.type = "button"
  strip.append(el("span", "sr-chev"), el("span", "sr-strip-label", "Skills"))
  const count = el("span", "sr-strip-count")
  strip.append(count)
  strip.onclick = () => setRailOpen(!rail.open, true)

  const panel = el("div", "sr-panel")
  const handle = el("div", "sr-handle")
  handle.title = "Drag to resize. Double-click to reset."
  panel.append(handle)
  const head = el("div", "sr-head")
  const session = el("div", "sr-session")
  head.append(session)

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

  const list = el("div", "sr-list")
  list.setAttribute("role", "listbox")

  const foot = el("div", "sr-foot")
  const msg = el("div", "sr-msg")
  foot.append(msg, el("div", "hint", "Inserts the command without running it. Add arguments, then press Enter."))

  panel.append(head, search, list, foot)
  root.append(strip, panel)
  host.append(root)
  els = { root, strip, session, search, list, msg, count }
  wireRailHandle(handle, root)
  renderRail()
  if (!store.data) void refresh()
}

const applyRailWidth = () => {
  if (!els) return
  const w = settings().railWidth
  els.root.style.setProperty("--sr-panel", `${Number.isFinite(w) && w >= 200 ? Math.min(480, w) : DEFAULT_WIDTH}px`)
}

const save = (patch: Parameters<typeof saveSettings>[0]) => saveSettings(patch).catch(() => settings())

// Panel sits right, so dragging left widens.
const wireRailHandle = (handle: HTMLElement, root: HTMLElement) => {
  let drag: { w: number | null; right: number } | null = null
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    drag = { w: null, right: root.getBoundingClientRect().right }
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    document.body.classList.add("resizing")
    e.preventDefault()
  })
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return
    drag.w = Math.round(Math.min(480, Math.max(200, drag.right - e.clientX)))
    root.style.setProperty("--sr-panel", `${drag.w}px`)
  })
  const end = () => {
    if (!drag) return
    const w = drag.w
    drag = null
    handle.classList.remove("dragging")
    document.body.classList.remove("resizing")
    if (w != null) void save({ railWidth: w })
  }
  handle.addEventListener("pointerup", end)
  handle.addEventListener("pointercancel", end)
  handle.addEventListener("dblclick", () => void save({ railWidth: DEFAULT_WIDTH }))
}

const setRailOpen = (open: boolean, persist: boolean) => {
  rail.open = open
  applyRailOpen()
  if (open && persist) els?.search.focus()
  if (persist) {
    rail.saving++
    void save({ skillRailOpen: open }).then(() => {
      rail.saving--
    })
  }
}

const applyRailOpen = () => {
  if (!els) return
  applyRailWidth()
  els.root.classList.toggle("open", rail.open)
  els.strip.setAttribute("aria-expanded", String(rail.open))
  els.strip.title = rail.open ? "Hide skills" : "Show skills: click one to type its command into the focused session"
}

// Project skills exist only inside their project.
const isProjectScoped = (r: SkillRow) => r.source === "project" || r.id.startsWith("project-command:")

const inScope = (r: SkillRow, cwd: string | null) => {
  if (!isProjectScoped(r)) return true
  if (!cwd || !r.scope) return false
  return cwd === r.scope || cwd.startsWith(r.scope.replace(/\/+$/, "") + "/")
}

const runnable = (r: SkillRow, cwd: string | null) =>
  r.userInvocable && (r.state === "on" || r.state === "user-invocable-only") && inScope(r, cwd)

const focusedCwd = () => focused()?.cwd || null

const railRows = () => {
  if (!store.data) return []
  const q = rail.query.trim().toLowerCase()
  const cwd = focusedCwd()
  return store.data.skills
    .filter((r) => runnable(r, cwd) && matches(r, q))
    .sort((a, b) => a.invoke.localeCompare(b.invoke, undefined, { sensitivity: "base" }))
}

const renderRail = () => {
  if (!els) return
  applyRailOpen()
  renderRailHead()
  renderRailList()
}

onRender(renderRail)

const renderRailHead = () => {
  if (!els) return
  const { session } = els
  const f = focused()
  session.replaceChildren()
  session.classList.toggle("quiet", !f)
  if (f) {
    session.append(el("span", "sr-session-label", "Typing into"), el("span", "sr-session-name", f.name || "Session"))
    session.title = f.name || ""
  } else {
    session.append(el("span", "sr-session-name", "Focus a session"))
    session.title = "Click a terminal or chat first, then pick a skill."
  }
}

const renderRailList = () => {
  if (!els) return
  const { list, count } = els
  const data = store.data
  const rows = railRows()
  rail.visible = rows
  const cwd = focusedCwd()
  count.textContent = data ? fmt(data.skills.filter((r) => runnable(r, cwd)).length) : ""
  if (!rows.some((r) => r.id === rail.activeId)) rail.activeId = rows[0]?.id ?? null

  const frag = document.createDocumentFragment()
  if (!data) {
    frag.append(el("div", "sr-empty", store.loadError || "Reading your skills."))
  } else if (!rows.length) {
    frag.append(el("div", "sr-empty", rail.query.trim() ? "No skills match." : "No skills you can run right now."))
  } else {
    rows.forEach((row, i) => {
      const item = el("button", `sr-item${row.id === rail.activeId ? " active" : ""}`)
      item.type = "button"
      item.id = `sr-${i}`
      item.setAttribute("role", "option")
      item.dataset["id"] = row.id
      item.title = row.description || row.invoke
      item.append(el("span", "sr-invoke", row.invoke))
      if (row.description) item.append(el("span", "sr-desc", row.description))
      item.onclick = () => {
        rail.activeId = row.id
        inject(row)
      }
      frag.append(item)
    })
  }
  list.replaceChildren(frag)
}

const moveActive = (delta: number) => {
  if (!els) return
  const rows = rail.visible
  if (!rows.length) return
  const i = Math.max(0, rows.findIndex((r) => r.id === rail.activeId))
  const next = Math.min(rows.length - 1, Math.max(0, i + delta))
  rail.activeId = rows[next]?.id ?? null
  for (const node of els.list.children) {
    if (node instanceof HTMLElement) node.classList.toggle("active", node.dataset["id"] === rail.activeId)
  }
  const node = els.list.children[next]
  if (node) {
    node.scrollIntoView({ block: "nearest" })
    els.search.setAttribute("aria-activedescendant", node.id)
  }
}

const onRailKey = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown") {
    e.preventDefault()
    moveActive(1)
  } else if (e.key === "ArrowUp") {
    e.preventDefault()
    moveActive(-1)
  } else if (e.key === "Enter") {
    e.preventDefault()
    const row = rail.visible.find((r) => r.id === rail.activeId)
    if (row) inject(row)
  } else if (e.key === "Escape" && els?.search.value) {
    e.stopPropagation()
    els.search.value = ""
    rail.query = ""
    rail.activeId = null
    renderRailList()
  }
}

const inject = (row: SkillRow) => {
  try {
    const ok = focused() ? insertIntoFocused(`${row.invoke} `) : false
    flash(ok ? `Typed ${row.invoke}` : "Focus a session first", ok ? "ok" : "warn")
  } catch {
    flash("Could not type into the session", "warn")
  }
}

const flash = (text: string, kind: "ok" | "warn") => {
  if (!els) return
  const { msg } = els
  msg.textContent = text
  msg.className = `sr-msg show ${kind}`
  clearTimeout(rail.msgTimer)
  rail.msgTimer = setTimeout(() => {
    msg.className = "sr-msg"
  }, 2200)
}

onSettingsChanged(() => {
  if (!els) return
  applyRailWidth()
  const open = settings().skillRailOpen
  if (!rail.saving && open !== rail.open) {
    rail.open = open
    applyRailOpen()
  }
})

// Rail is scoped to the focused project.
onFocusChanged(() => {
  renderRailHead()
  renderRailList()
})
