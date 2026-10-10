import type { SkillRow } from "../../shared/skills.ts"
import { el } from "../dom.ts"
import { focused, insertIntoFocused } from "../focus.ts"
import { railRows } from "./rail-filter.ts"
import { rail } from "./rail-state.ts"
import { store } from "./state.ts"

const flash = (text: string, kind: "ok" | "warn") => {
  if (!rail.els) {
    return
  }
  const { msg } = rail.els
  msg.textContent = text
  msg.className = `sr-msg show ${kind}`
  clearTimeout(rail.msgTimer)
  rail.msgTimer = setTimeout(() => {
    msg.className = "sr-msg"
  }, 2200)
}

// Type the skill's command into the focused session
const inject = (row: SkillRow) => {
  try {
    const ok = focused() ? insertIntoFocused(`${row.invoke} `) : false
    flash(ok ? `Typed ${row.invoke}` : "Focus a session first", ok ? "ok" : "warn")
  } catch {
    flash("Could not type into the session", "warn")
  }
}

const railItem = (row: SkillRow, i: number) => {
  const item = el("button", `sr-item${row.id === rail.activeId ? " active" : ""}`)
  item.type = "button"
  item.id = `sr-${i}`
  item.setAttribute("role", "option")
  item.dataset["id"] = row.id
  item.title = row.description || row.invoke
  item.append(el("span", "sr-invoke", row.invoke))
  if (row.description) {
    item.append(el("span", "sr-desc", row.description))
  }
  item.onclick = () => {
    rail.activeId = row.id
    inject(row)
  }
  return item
}

const emptyText = (rows: ReadonlyArray<SkillRow>) => {
  if (!store.data) {
    return store.loadError || "Reading your skills."
  }
  if (!rows.length) {
    return rail.query.trim() ? "No skills match." : "No skills you can run right now."
  }
  return null
}

export const renderRailList = () => {
  if (!rail.els) {
    return
  }
  const { list } = rail.els
  const rows = railRows(rail.query)
  rail.visible = rows
  if (!rows.some((r) => r.id === rail.activeId)) {
    rail.activeId = rows[0]?.id ?? null
  }
  const empty = emptyText(rows)
  if (empty !== null) {
    list.replaceChildren(el("div", "sr-empty", empty))
    return
  }
  list.replaceChildren(...rows.map(railItem))
}

const moveActive = (delta: number) => {
  const els = rail.els
  const rows = rail.visible
  if (!els || !rows.length) {
    return
  }
  const i = Math.max(0, rows.findIndex((r) => r.id === rail.activeId))
  const next = Math.min(rows.length - 1, Math.max(0, i + delta))
  rail.activeId = rows[next]?.id ?? null
  ;[...els.list.children]
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .forEach((node) => node.classList.toggle("active", node.dataset["id"] === rail.activeId))
  const node = els.list.children[next]
  if (node) {
    node.scrollIntoView({ block: "nearest" })
    els.search.setAttribute("aria-activedescendant", node.id)
  }
}

const clearSearch = (e: KeyboardEvent) => {
  if (!rail.els?.search.value) {
    return
  }
  e.stopPropagation()
  rail.els.search.value = ""
  rail.query = ""
  rail.activeId = null
  renderRailList()
}

const injectActive = () => {
  const row = rail.visible.find((r) => r.id === rail.activeId)
  if (row) {
    inject(row)
  }
}

// Arrow keys move, Enter types, Escape clears the search
export const onRailKey = (e: KeyboardEvent) => {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault()
      moveActive(1)
      return
    case "ArrowUp":
      e.preventDefault()
      moveActive(-1)
      return
    case "Enter":
      e.preventDefault()
      injectActive()
      return
    case "Escape":
      clearSearch(e)
      return
  }
}
