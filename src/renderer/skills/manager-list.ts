import type { SkillRow } from "../../shared/skills.ts"
import { el } from "../dom.ts"
import { groupActions } from "./manager-actions.ts"
import { skillRow } from "./manager-row.ts"
import { GROUPS, type Group, mgr } from "./manager-state.ts"
import { fmt, matches, plural, store } from "./state.ts"

export const visibleGroupKeys = () => {
  const data = store.data
  return GROUPS.map((g) => g.key).filter((k) => !data || data.skills.some((r) => r.source === k))
}

const byName = (a: SkillRow, b: SkillRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
const byTokens = (a: SkillRow, b: SkillRow) => b.listingTokens - a.listingTokens || byName(a, b)

const sortRows = (rows: ReadonlyArray<SkillRow>) => rows.slice().sort(mgr.sort === "name" ? byName : byTokens)

const toggleTitle = (searching: boolean, open: boolean) => {
  if (searching) {
    return "Groups stay open while you search."
  }
  return open ? "Collapse this group" : "Expand this group"
}

const groupToggle = (group: Group, all: ReadonlyArray<SkillRow>, rows: ReadonlyArray<SkillRow>, open: boolean, searching: boolean) => {
  const subtotal = rows.reduce((n, r) => n + r.listingTokens, 0)
  const toggle = el("button", "sm-group-toggle")
  toggle.type = "button"
  toggle.setAttribute("aria-expanded", String(open))
  const countText = rows.length === all.length ? plural(rows.length, "skill", "skills") : `${fmt(rows.length)} of ${fmt(all.length)}`
  toggle.append(
    el("span", "sm-chev"),
    el("span", "sm-group-name", group.label),
    el("span", "sm-group-count", countText),
    el("span", "sm-group-tokens", group.key === "parked" ? "" : `${fmt(subtotal)} tokens`),
  )
  toggle.title = toggleTitle(searching, open)
  toggle.onclick = () => {
    if (searching) {
      return
    }
    if (!mgr.collapsed.delete(group.key)) {
      mgr.collapsed.add(group.key)
    }
    renderList()
  }
  return toggle
}

const groupSection = (group: Group, all: ReadonlyArray<SkillRow>, rows: ReadonlyArray<SkillRow>, maxTokens: number, searching: boolean) => {
  const open = searching || !mgr.collapsed.has(group.key)
  const section = el("section", `sm-group${open ? " open" : ""}`)
  const head = el("div", "sm-group-head")
  head.append(groupToggle(group, all, rows, open, searching), groupActions(group, rows, mgr.busy.has(`g:${group.key}`)))
  section.append(head)
  const err = mgr.groupErrors.get(group.key)
  if (err) {
    section.append(el("div", "sm-err sm-group-err", err))
  }
  if (!open) {
    return section
  }
  const body = el("div", "sm-group-body")
  if (group.note) {
    body.append(el("div", "hint sm-group-note", group.note))
  }
  body.append(...rows.map((row) => skillRow(row, maxTokens)))
  section.append(body)
  return section
}

const EMPTY_TEXT =
  "No skills yet. Skills you add to ~/.claude/skills, to a project or through a plugin will appear here, with what each one costs."

// Every group with its matching rows
export const renderList = () => {
  const els = mgr.els
  if (!els) {
    return
  }
  const { list, foldBtn, sortBtns } = els
  sortBtns.forEach((b, key) => b.classList.toggle("on", mgr.sort === key))
  const data = store.data
  if (!data || !data.skills.length) {
    foldBtn.hidden = true
    list.replaceChildren(...(data ? [el("div", "sm-empty", EMPTY_TEXT)] : []))
    return
  }
  foldBtn.hidden = false
  const q = mgr.query.trim().toLowerCase()
  const maxTokens = data.skills.reduce((m, r) => Math.max(m, r.listingTokens), 0)
  const sections = GROUPS.flatMap((group) => {
    const all = data.skills.filter((r) => r.source === group.key)
    const rows = sortRows(all.filter((r) => matches(r, q)))
    return rows.length ? [{ group, all, rows }] : []
  })
  const nodes = sections.map(({ group, all, rows }) => groupSection(group, all, rows, maxTokens, !!q))
  if (!sections.length) {
    nodes.push(el("div", "sm-empty", `No skills match "${mgr.query.trim()}".`))
  }
  const anyOpen = visibleGroupKeys().some((k) => !mgr.collapsed.has(k))
  foldBtn.textContent = anyOpen ? "Collapse all" : "Expand all"
  list.replaceChildren(...nodes)
}
