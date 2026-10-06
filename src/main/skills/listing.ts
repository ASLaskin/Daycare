// Rows and totals for Claude Code's skill listing cost.

import type { DirPath, FilePath, SkillId } from "../../shared/ids.ts"
import type { RowState, SkillRow, SkillSource, SkillTotals } from "../../shared/skills.ts"
import type { MdFile } from "./files.ts"
import { isFalse, isTrue, str } from "./frontmatter.ts"

// Roughly four characters per token.
const CHARS_PER_TOKEN = 4
const LISTING_MAX_DESC_CHARS = 1536
const LISTING_BUDGET_FRACTION = 0.01
const LISTING_CONTEXT_CHARS = 200000
const LISTING_BUDGET_CHARS = Math.floor(LISTING_CONTEXT_CHARS * CHARS_PER_TOKEN * LISTING_BUDGET_FRACTION)

const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN)

export interface RowBase {
  readonly id: SkillId
  readonly kind: "skill" | "command"
  readonly dirName: string
  readonly source: SkillSource
  readonly scope: string
  readonly dir: DirPath
  readonly symlink: boolean
  readonly plugin?: string
}

// Listing characters one skill adds; name only drops the description.
const listingCharsFor = (state: RowState, name: string, description: string, whenToUse: string, modelInvocable: boolean) => {
  if (state === "off" || state === "parked" || state === "user-invocable-only" || !modelInvocable) {
    return 0
  }
  if (state === "name-only") {
    return name.length + 2
  }
  const desc = `${description}${whenToUse ? ` - ${whenToUse}` : ""}`
  return name.length + 4 + Math.min(desc.length, LISTING_MAX_DESC_CHARS)
}

export const makeRow = (base: RowBase, file: MdFile, state: RowState, settingsFile: FilePath | null, locked: "plugin" | null): SkillRow => {
  const { text, data } = file
  const name = str(data["name"]) || base.dirName
  const description = str(data["description"])
  const whenToUse = str(data["when_to_use"])
  const parked = state === "parked"
  const frontmatterBlocksModel = isTrue(data["disable-model-invocation"])
  const userInvocable = !parked && state !== "off" && !isFalse(data["user-invocable"])
  const modelInvocable = !parked && state !== "off" && state !== "user-invocable-only" && !frontmatterBlocksModel
  const listingChars = listingCharsFor(state, name, description, whenToUse, modelInvocable)
  return {
    id: base.id,
    name,
    invoke: base.plugin ? `/${base.plugin}:${name}` : `/${name}`,
    source: base.source,
    scope: base.scope,
    dir: base.dir,
    description,
    whenToUse,
    state,
    locked: locked ?? (frontmatterBlocksModel ? "frontmatter" : null),
    userInvocable,
    modelInvocable,
    listingChars,
    listingTokens: Math.ceil(listingChars / CHARS_PER_TOKEN),
    bodyTokens: estimateTokens(text),
    settingsFile,
    symlink: base.symlink,
  }
}

export const totalsOf = (rows: ReadonlyArray<SkillRow>): SkillTotals => {
  const listed = rows.filter((r) => r.listingChars > 0).length
  const off = rows.filter((r) => r.state === "off").length
  const parked = rows.filter((r) => r.state === "parked").length
  // Listed entries are joined by one separator character.
  const listingChars = rows.reduce((sum, r) => sum + r.listingChars, 0) + Math.max(0, listed - 1)
  const listingTokens = Math.ceil(listingChars / CHARS_PER_TOKEN)
  const budgetTokens = Math.ceil(LISTING_BUDGET_CHARS / CHARS_PER_TOKEN)
  return {
    listingChars,
    listingTokens,
    on: rows.length - off - parked,
    off,
    parked,
    budgetChars: LISTING_BUDGET_CHARS,
    budgetTokens,
    overBudget: listingChars > LISTING_BUDGET_CHARS,
    // Tokens actually spent, capped at the budget.
    effectiveTokens: Math.min(listingTokens, budgetTokens),
  }
}
