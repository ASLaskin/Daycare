import type { RowState, SkillsListing } from "../../shared/skills.ts"
import { el } from "../dom.ts"
import { fmt, plural, refresh, store } from "./state.ts"

const COUNT_LABELS: ReadonlyArray<readonly [RowState, string]> = [
  ["on", "on"],
  ["name-only", "name only"],
  ["user-invocable-only", "only when I ask"],
  ["off", "off"],
  ["parked", "parked"],
]

const OVER_BUDGET_HINT = (total: number, budget: number) =>
  `Claude lists every active skill at the start of each session. Your skills want ${fmt(total)} tokens, over the ${fmt(budget)} the listing is allowed, so Claude is already cutting descriptions to fit and some skills arrive as a bare name. Set the ones you rarely use to Name only, Only when I ask or Off until the list fits.`
const HINT =
  "Claude lists every active skill at the start of each session, and that listing counts against its context before you type anything. Set skills you rarely use to Name only, Only when I ask or Off to shrink it."

export const retryButton = () => {
  const b = el("button", "ghost sm-retry", "Try again")
  b.type = "button"
  b.onclick = () => void refresh()
  return b
}

const countsText = (data: SkillsListing) => {
  const rows = data.skills
  if (!rows.length) {
    return "No skills found"
  }
  const parts = COUNT_LABELS.map(([state, label]) => [rows.filter((r) => r.state === state).length, label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${fmt(n)} ${label}`)
  return `${plural(rows.length, "skill", "skills")}: ${parts.join(", ")}`
}

// Token cost headline, state counts and budget hint
export const renderSummary = (box: HTMLElement) => {
  box.replaceChildren()
  const { data, loadError } = store
  if (!data) {
    box.append(el("div", "card-title", "Skills"), el("div", "hint", loadError || "Reading your skills."))
    if (loadError) {
      box.append(retryButton())
    }
    return
  }
  const totals = data.totals
  const total = Number.isFinite(totals.listingTokens) ? totals.listingTokens : data.skills.reduce((n, r) => n + r.listingTokens, 0)
  // Effective token count when over the listing budget
  const overBudget = totals.overBudget && Number.isFinite(totals.budgetTokens)
  const big = el("div", "sm-big")
  const num = el("span", "sm-num", fmt(overBudget ? totals.effectiveTokens : total))
  num.title = "Estimated at about four characters per token."
  big.append(num, el("span", "sm-num-label", "tokens added to every session"))
  box.append(big, el("div", "sm-counts", countsText(data)), el("div", "hint", overBudget ? OVER_BUDGET_HINT(total, totals.budgetTokens) : HINT))
  box.classList.toggle("over-budget", overBudget)
  if (loadError) {
    box.append(el("div", "sm-error", `Could not refresh: ${loadError}`), retryButton())
  }
}

export const renderWarnings = (box: HTMLElement) => {
  box.replaceChildren()
  const warnings = store.data?.warnings ?? []
  if (!warnings.length) {
    return
  }
  box.append(el("div", "sm-warn-title", plural(warnings.length, "thing to know", "things to know")))
  const ul = el("ul", "sm-warn-list")
  ul.append(...warnings.map((w) => el("li", null, String(w))))
  box.append(ul)
}
