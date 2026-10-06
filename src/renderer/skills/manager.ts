import type { RowState, SkillRow, SkillSource, SkillsListing, SkillState } from "../../shared/skills.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { applyResult, enqueue, fmt, matches, messageOf, onRender, plural, refresh, store } from "./state.ts"

interface Group {
  readonly key: SkillSource
  readonly label: string
  readonly note: string
}

const GROUPS: ReadonlyArray<Group> = [
  { key: "personal", label: "Personal", note: "" },
  { key: "project", label: "Project", note: "" },
  { key: "plugin", label: "Plugins", note: "A plugin turns on or off as a whole, so the switch on one row changes every skill from that plugin." },
  { key: "synced", label: "Synced", note: "" },
  { key: "parked", label: "Parked", note: "Moved aside by hand into ~/.claude/skills-disabled. Restore puts a skill back where Claude can see it." },
]

const STATE_OPTIONS: ReadonlyArray<{ value: SkillState; label: string; title: string }> = [
  { value: "on", label: "On", title: "Listed with its full description. Claude can use it on its own, and you can run it with its slash command." },
  { value: "name-only", label: "Name only", title: "Only the name is listed, with no description. Cheaper, but Claude has less to go on when choosing it." },
  { value: "user-invocable-only", label: "Only when I ask", title: "Hidden from Claude, so it costs nothing in every session. It still runs when you type its slash command." },
  { value: "off", label: "Off", title: "Fully disabled. Not listed to Claude and not available as a slash command." },
]
const FRONTMATTER_FORBIDS = new Set<string>(["on", "name-only"])

type Call = () => Promise<SkillsListing>
type Sort = "tokens" | "name"

interface Els {
  host: HTMLElement
  summary: HTMLElement
  list: HTMLElement
  warn: HTMLElement
  foldBtn: HTMLButtonElement
  sortBtns: Map<Sort, HTMLButtonElement>
}

let els: Els | null = null
const mgr = {
  query: "",
  sort: "tokens" as Sort,
  collapsed: new Set<string>(),
  rowErrors: new Map<string, string>(),
  groupErrors: new Map<string, string>(),
  busy: new Set<string>(),
}

const SEARCH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.3 10.3L13.5 13.5"/></svg>'
const FOLDER_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>'

export const mountManager = (host: HTMLElement) => {
  host.replaceChildren()
  host.classList.add("skills-manager")

  const summary = el("div", "sm-summary card highlight")

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

  const searchWrap = el("div", "sm-search-wrap")
  searchWrap.innerHTML = SEARCH_ICON
  searchWrap.append(search)

  const seg = el("div", "seg sm-seg")
  seg.setAttribute("role", "group")
  seg.setAttribute("aria-label", "Sort skills")
  const sortBtns = new Map<Sort, HTMLButtonElement>()
  for (const [key, label, title] of [
    ["tokens", "Most tokens", "Most expensive first"],
    ["name", "Name", "Alphabetical"],
  ] as const) {
    const b = el("button", "ghost", label)
    b.type = "button"
    b.title = title
    b.onclick = () => {
      mgr.sort = key
      renderList()
    }
    sortBtns.set(key, b)
    seg.append(b)
  }

  const foldBtn = el("button", "ghost sm-fold")
  foldBtn.type = "button"
  foldBtn.onclick = () => {
    const open = visibleGroupKeys().some((k) => !mgr.collapsed.has(k))
    mgr.collapsed = open ? new Set(GROUPS.map((g) => g.key)) : new Set()
    renderList()
  }

  const bar = el("div", "sm-toolbar")
  bar.append(searchWrap, seg, foldBtn)

  const list = el("div", "sm-groups")
  const warn = el("div", "sm-warnings")
  host.append(summary, bar, list, warn)
  els = { host, summary, list, warn, foldBtn, sortBtns }

  renderManager()
  void refresh()
}

const visibleGroupKeys = () => {
  const data = store.data
  return GROUPS.map((g) => g.key).filter((k) => !data || data.skills.some((r) => r.source === k))
}

const renderManager = () => {
  if (!els) return
  renderSummary(els)
  renderList()
  renderWarnings(els)
}

onRender(renderManager)

const renderSummary = ({ summary: box }: Els) => {
  box.replaceChildren()
  const { data, loadError } = store

  if (!data) {
    box.append(el("div", "card-title", "Skills"), el("div", "hint", loadError || "Reading your skills."))
    if (loadError) box.append(retryButton())
    return
  }

  const rows = data.skills
  const totals = data.totals
  const total = Number.isFinite(totals.listingTokens) ? totals.listingTokens : rows.reduce((n, r) => n + r.listingTokens, 0)
  // Past budget Claude truncates, so the sum overstates.
  const overBudget = totals.overBudget && Number.isFinite(totals.budgetTokens)
  const shown = overBudget ? totals.effectiveTokens : total
  const count = (state: RowState) => rows.filter((r) => r.state === state).length
  const parts = (
    [
      [count("on"), "on"],
      [count("name-only"), "name only"],
      [count("user-invocable-only"), "only when I ask"],
      [count("off"), "off"],
      [count("parked"), "parked"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${fmt(n)} ${label}`)

  const big = el("div", "sm-big")
  const num = el("span", "sm-num", fmt(shown))
  num.title = "Estimated at about four characters per token."
  big.append(num, el("span", "sm-num-label", "tokens added to every session"))

  box.append(
    big,
    el("div", "sm-counts", rows.length ? `${plural(rows.length, "skill", "skills")}: ${parts.join(", ")}` : "No skills found"),
    el(
      "div",
      "hint",
      overBudget
        ? `Claude lists every active skill at the start of each session. Your skills want ${fmt(total)} tokens, over the ${fmt(totals.budgetTokens)} the listing is allowed, so Claude is already cutting descriptions to fit and some skills arrive as a bare name. Set the ones you rarely use to Name only, Only when I ask or Off until the list fits.`
        : "Claude lists every active skill at the start of each session, and that listing counts against its context before you type anything. Set skills you rarely use to Name only, Only when I ask or Off to shrink it.",
    ),
  )
  box.classList.toggle("over-budget", overBudget)
  if (loadError) box.append(el("div", "sm-error", `Could not refresh: ${loadError}`), retryButton())
}

const retryButton = () => {
  const b = el("button", "ghost sm-retry", "Try again")
  b.type = "button"
  b.onclick = () => void refresh()
  return b
}

const sortRows = (rows: ReadonlyArray<SkillRow>) => {
  const byName = (a: SkillRow, b: SkillRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  return rows.slice().sort(mgr.sort === "name" ? byName : (a, b) => b.listingTokens - a.listingTokens || byName(a, b))
}

const renderList = () => {
  if (!els) return
  const { list, foldBtn, sortBtns } = els
  for (const [key, b] of sortBtns) b.classList.toggle("on", mgr.sort === key)

  const data = store.data
  const frag = document.createDocumentFragment()
  const q = mgr.query.trim().toLowerCase()

  if (!data) {
    list.replaceChildren()
    foldBtn.hidden = true
    return
  }
  foldBtn.hidden = false

  if (!data.skills.length) {
    foldBtn.hidden = true
    frag.append(el("div", "sm-empty", "No skills yet. Skills you add to ~/.claude/skills, to a project or through a plugin will appear here, with what each one costs."))
    list.replaceChildren(frag)
    return
  }

  const maxTokens = data.skills.reduce((m, r) => Math.max(m, r.listingTokens), 0)
  let shown = 0
  for (const group of GROUPS) {
    const all = data.skills.filter((r) => r.source === group.key)
    if (!all.length) continue
    const rows = sortRows(all.filter((r) => matches(r, q)))
    if (!rows.length) continue
    shown += rows.length
    frag.append(groupSection(group, all, rows, maxTokens, !!q))
  }
  if (!shown) frag.append(el("div", "sm-empty", `No skills match "${mgr.query.trim()}".`))

  const anyOpen = visibleGroupKeys().some((k) => !mgr.collapsed.has(k))
  foldBtn.textContent = anyOpen ? "Collapse all" : "Expand all"
  list.replaceChildren(frag)
}

const groupSection = (group: Group, all: ReadonlyArray<SkillRow>, rows: ReadonlyArray<SkillRow>, maxTokens: number, searching: boolean) => {
  const key = group.key
  const open = searching || !mgr.collapsed.has(key)
  const section = el("section", `sm-group${open ? " open" : ""}`)
  const groupBusy = mgr.busy.has(`g:${key}`)
  const subtotal = rows.reduce((n, r) => n + r.listingTokens, 0)

  const head = el("div", "sm-group-head")
  const toggle = el("button", "sm-group-toggle")
  toggle.type = "button"
  toggle.setAttribute("aria-expanded", String(open))
  toggle.append(el("span", "sm-chev"), el("span", "sm-group-name", group.label))
  const countText = rows.length === all.length ? plural(rows.length, "skill", "skills") : `${fmt(rows.length)} of ${fmt(all.length)}`
  toggle.append(el("span", "sm-group-count", countText))
  toggle.append(el("span", "sm-group-tokens", key === "parked" ? "" : `${fmt(subtotal)} tokens`))
  toggle.title = searching ? "Groups stay open while you search." : open ? "Collapse this group" : "Expand this group"
  toggle.onclick = () => {
    if (searching) return
    if (mgr.collapsed.has(key)) mgr.collapsed.delete(key)
    else mgr.collapsed.add(key)
    renderList()
  }
  head.append(toggle, groupActions(group, rows, groupBusy))
  section.append(head)

  const err = mgr.groupErrors.get(key)
  if (err) section.append(el("div", "sm-err sm-group-err", err))

  if (open) {
    const body = el("div", "sm-group-body")
    if (group.note) body.append(el("div", "hint sm-group-note", group.note))
    for (const row of rows) body.append(skillRow(row, maxTokens))
    section.append(body)
  }
  return section
}

const groupActions = (group: Group, rows: ReadonlyArray<SkillRow>, busy: boolean) => {
  const wrap = el("div", "sm-group-actions")
  const make = (label: string, title: string, calls: ReadonlyArray<Call>, run: () => void) => {
    const b = el("button", "ghost sm-quiet", label)
    b.type = "button"
    b.title = calls.length ? title : "Nothing to change here."
    b.disabled = busy || !calls.length
    b.onclick = run
    return b
  }
  const groupSize = store.data ? store.data.skills.filter((r) => r.source === group.key).length : 0
  const scope = rows.length === groupSize ? "in this group" : "shown here"

  if (group.key === "parked") {
    const calls = rows.map((r): Call => () => api.restoreSkill(r.id))
    wrap.append(
      make("Restore all", `Move the ${plural(rows.length, "parked skill", "parked skills")} ${scope} back into ~/.claude/skills.`, calls, () => runBulk(group.key, calls)),
    )
    return wrap
  }

  const turn = (enable: boolean) => {
    const calls: Array<Call> = []
    const seenPlugins = new Set<string>()
    for (const r of rows) {
      if (r.locked === "plugin") {
        if (seenPlugins.has(r.scope)) continue
        const members = rows.filter((x) => x.scope === r.scope)
        const relevant = enable ? members.some((x) => x.state === "off") : members.some((x) => x.state !== "off")
        if (!relevant) continue
        seenPlugins.add(r.scope)
        calls.push(() => api.setSkillPlugin(r.id, enable))
      } else if (enable ? r.state === "off" : r.state !== "off") {
        calls.push(() => api.setSkillState(r.id, enable ? "on" : "off"))
      }
    }
    return calls
  }
  const offCalls = turn(false)
  const onCalls = turn(true)
  const unit = group.key === "plugin" ? "plugins" : "skills"
  wrap.append(
    make("Turn off", `Turn off the ${unit} ${scope} that are on. You can turn them back on.`, offCalls, () => runBulk(group.key, offCalls)),
    make("Turn on", `Turn on the ${unit} ${scope} that are off.`, onCalls, () => runBulk(group.key, onCalls)),
  )
  return wrap
}

const runBulk = (groupKey: string, calls: ReadonlyArray<Call>) => {
  const busyKey = `g:${groupKey}`
  mgr.busy.add(busyKey)
  mgr.groupErrors.delete(groupKey)
  renderList()
  void enqueue(async () => {
    let done = 0
    try {
      for (const call of calls) {
        applyResult(await call())
        done++
      }
    } catch (err) {
      mgr.groupErrors.set(groupKey, `Stopped after ${done} of ${calls.length}: ${messageOf(err)}`)
      setTimeout(() => {
        mgr.groupErrors.delete(groupKey)
        renderList()
      }, 10000)
    }
  }).then(() => {
    mgr.busy.delete(busyKey)
    renderList()
  })
}

// A failed call keeps old data.
const mutateRow = (row: SkillRow, call: Call) => {
  mgr.busy.add(row.id)
  mgr.rowErrors.delete(row.id)
  renderList()
  void enqueue(call)
    .then(applyResult, (err) => {
      mgr.rowErrors.set(row.id, messageOf(err))
      setTimeout(() => {
        mgr.rowErrors.delete(row.id)
        renderList()
      }, 8000)
    })
    .then(() => {
      mgr.busy.delete(row.id)
      renderList()
    })
}

const badgeText = (row: SkillRow) => {
  if (row.source === "project") return row.scope.replace(/\/+$/, "").split("/").pop() || row.scope
  if (row.source === "plugin") return row.scope.split("@")[0] ?? row.scope
  return row.source
}

const skillRow = (row: SkillRow, maxTokens: number) => {
  const busy = mgr.busy.has(row.id) || mgr.busy.has(`g:${row.source}`)
  const item = el("div", `sm-row st-${row.state}${busy ? " busy" : ""}`)

  const main = el("div", "sm-main")
  const line = el("div", "sm-line")
  const badge = el("span", "sm-badge", badgeText(row))
  badge.title = row.scope
  line.append(el("span", "sm-name", row.name), el("span", "sm-invoke", row.invoke), badge)
  const desc = el("div", "sm-desc", row.description || "No description")
  main.title = row.description ? row.description + (row.whenToUse ? `\n\nWhen to use: ${row.whenToUse}` : "") : ""
  main.append(line, desc)

  const cost = el("div", "sm-cost")
  cost.title = `${fmt(row.listingTokens)} tokens in every session. Another ${fmt(row.bodyTokens)} load only when the skill runs.`
  cost.append(el("span", `sm-cost-num${row.listingTokens ? "" : " zero"}`, fmt(row.listingTokens)))
  if (row.listingTokens > 0 && maxTokens > 0) {
    const meter = el("span", `meter${row.listingTokens >= maxTokens * 0.6 ? " amber" : ""}`)
    const fill = el("span")
    fill.style.width = `${Math.max(4, Math.round((row.listingTokens / maxTokens) * 100))}%`
    meter.append(fill)
    cost.append(meter)
  }

  const control = el("div", "sm-control")
  if (row.source === "parked") {
    control.append(el("span", "sm-note", "Parked"))
    const restore = el("button", "ghost sm-restore", "Restore")
    restore.type = "button"
    restore.title = "Move this skill back into ~/.claude/skills"
    restore.disabled = busy
    restore.onclick = () => mutateRow(row, () => api.restoreSkill(row.id))
    control.append(restore)
  } else if (row.locked === "plugin") {
    const sw = el("input", "switch sm-switch")
    sw.type = "checkbox"
    sw.checked = row.state !== "off"
    sw.disabled = busy
    sw.setAttribute("aria-label", `${row.scope} plugin`)
    sw.title = `Turns the whole ${row.scope} plugin ${sw.checked ? "off" : "on"}, not just this skill.`
    sw.onchange = () => mutateRow(row, () => api.setSkillPlugin(row.id, sw.checked))
    const note = el("span", "sm-note", "from a plugin")
    note.title = "Plugin skills follow their plugin. Use the switch to turn the whole plugin on or off."
    control.append(sw, note)
  } else {
    const sel = el("select", "sm-select")
    sel.setAttribute("aria-label", `State for ${row.name}`)
    for (const opt of STATE_OPTIONS) {
      const o = el("option", null, opt.label)
      o.value = opt.value
      o.title = opt.title
      if (row.locked === "frontmatter" && FRONTMATTER_FORBIDS.has(opt.value)) {
        o.disabled = true
        o.title = "This skill blocks Claude from using it on its own, so it cannot be listed."
      }
      sel.append(o)
    }
    sel.value = row.state
    sel.disabled = busy
    sel.title =
      row.locked === "frontmatter"
        ? "This skill sets disable-model-invocation in its own file, so Claude never uses it on its own. It costs nothing in every session. You can still turn it off."
        : (STATE_OPTIONS.find((o) => o.value === row.state)?.title ?? "")
    sel.onchange = () => mutateRow(row, () => api.setSkillState(row.id, sel.value as SkillState))
    control.append(sel)
  }

  const reveal = el("button", "icon-btn sm-reveal")
  reveal.type = "button"
  reveal.title = `Show in Finder\n${row.dir}`
  reveal.setAttribute("aria-label", `Show ${row.name} in Finder`)
  reveal.innerHTML = FOLDER_ICON
  reveal.onclick = () => {
    api.openFinder(row.dir).catch((err) => {
      mgr.rowErrors.set(row.id, messageOf(err))
      renderList()
    })
  }

  item.append(main, cost, control, reveal)
  const err = mgr.rowErrors.get(row.id)
  if (err) item.append(el("div", "sm-err", err))
  return item
}

const renderWarnings = ({ warn: box }: Els) => {
  box.replaceChildren()
  const warnings = store.data?.warnings ?? []
  if (!warnings.length) return
  box.append(el("div", "sm-warn-title", plural(warnings.length, "thing to know", "things to know")))
  const ul = el("ul", "sm-warn-list")
  for (const w of warnings) ul.append(el("li", null, String(w)))
  box.append(ul)
}
