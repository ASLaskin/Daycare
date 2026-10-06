import type { SkillRow, SkillState } from "../../shared/skills.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { renderList } from "./manager-list.ts"
import { mutateRow } from "./manager-actions.ts"
import { mgr } from "./manager-state.ts"
import { fmt, messageOf } from "./state.ts"

const STATE_OPTIONS: ReadonlyArray<{ value: SkillState; label: string; title: string }> = [
  { value: "on", label: "On", title: "Listed with its full description. Claude can use it on its own, and you can run it with its slash command." },
  { value: "name-only", label: "Name only", title: "Only the name is listed, with no description. Cheaper, but Claude has less to go on when choosing it." },
  { value: "user-invocable-only", label: "Only when I ask", title: "Hidden from Claude, so it costs nothing in every session. It still runs when you type its slash command." },
  { value: "off", label: "Off", title: "Fully disabled. Not listed to Claude and not available as a slash command." },
]

// States a skill that disables model invocation cannot take
const FRONTMATTER_FORBIDS = new Set<string>(["on", "name-only"])

const FOLDER_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>'

const badgeText = (row: SkillRow) => {
  switch (row.source) {
    case "project":
      return row.scope.replace(/\/+$/, "").split("/").pop() || row.scope
    case "plugin":
      return row.scope.split("@")[0] ?? row.scope
    default:
      return row.source
  }
}

const mainCell = (row: SkillRow) => {
  const main = el("div", "sm-main")
  const line = el("div", "sm-line")
  const badge = el("span", "sm-badge", badgeText(row))
  badge.title = row.scope
  line.append(el("span", "sm-name", row.name), el("span", "sm-invoke", row.invoke), badge)
  main.title = row.description ? row.description + (row.whenToUse ? `\n\nWhen to use: ${row.whenToUse}` : "") : ""
  main.append(line, el("div", "sm-desc", row.description || "No description"))
  return main
}

const costCell = (row: SkillRow, maxTokens: number) => {
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
  return cost
}

const parkedControl = (row: SkillRow, busy: boolean) => {
  const restore = el("button", "ghost sm-restore", "Restore")
  restore.type = "button"
  restore.title = "Move this skill back into ~/.claude/skills"
  restore.disabled = busy
  restore.onclick = () => mutateRow(row, () => api.restoreSkill(row.id))
  return [el("span", "sm-note", "Parked"), restore]
}

const pluginControl = (row: SkillRow, busy: boolean) => {
  const sw = el("input", "switch sm-switch")
  sw.type = "checkbox"
  sw.checked = row.state !== "off"
  sw.disabled = busy
  sw.setAttribute("aria-label", `${row.scope} plugin`)
  sw.title = `Turns the whole ${row.scope} plugin ${sw.checked ? "off" : "on"}, not just this skill.`
  sw.onchange = () => mutateRow(row, () => api.setSkillPlugin(row.id, sw.checked))
  const note = el("span", "sm-note", "from a plugin")
  note.title = "Plugin skills follow their plugin. Use the switch to turn the whole plugin on or off."
  return [sw, note]
}

const stateOption = (row: SkillRow, opt: (typeof STATE_OPTIONS)[number]) => {
  const o = el("option", null, opt.label)
  o.value = opt.value
  o.title = opt.title
  if (row.locked === "frontmatter" && FRONTMATTER_FORBIDS.has(opt.value)) {
    o.disabled = true
    o.title = "This skill blocks Claude from using it on its own, so it cannot be listed."
  }
  return o
}

const stateControl = (row: SkillRow, busy: boolean) => {
  const sel = el("select", "sm-select")
  sel.setAttribute("aria-label", `State for ${row.name}`)
  sel.append(...STATE_OPTIONS.map((opt) => stateOption(row, opt)))
  sel.value = row.state
  sel.disabled = busy
  sel.title =
    row.locked === "frontmatter"
      ? "This skill sets disable-model-invocation in its own file, so Claude never uses it on its own. It costs nothing in every session. You can still turn it off."
      : (STATE_OPTIONS.find((o) => o.value === row.state)?.title ?? "")
  sel.onchange = () => mutateRow(row, () => api.setSkillState(row.id, sel.value as SkillState))
  return [sel]
}

const controlCell = (row: SkillRow, busy: boolean) => {
  const control = el("div", "sm-control")
  if (row.source === "parked") {
    control.append(...parkedControl(row, busy))
    return control
  }
  if (row.locked === "plugin") {
    control.append(...pluginControl(row, busy))
    return control
  }
  control.append(...stateControl(row, busy))
  return control
}

const revealButton = (row: SkillRow) => {
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
  return reveal
}

// One skill: name, cost, state control and Finder button
export const skillRow = (row: SkillRow, maxTokens: number) => {
  const busy = mgr.busy.has(row.id) || mgr.busy.has(`g:${row.source}`)
  const item = el("div", `sm-row st-${row.state}${busy ? " busy" : ""}`)
  item.append(mainCell(row), costCell(row, maxTokens), controlCell(row, busy), revealButton(row))
  const err = mgr.rowErrors.get(row.id)
  if (err) {
    item.append(el("div", "sm-err", err))
  }
  return item
}
