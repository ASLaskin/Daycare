// The skills inventory as the Settings > Skills tab and the rail show it.

import { Schema } from "effect"

export const SkillState = Schema.Literals(["on", "name-only", "user-invocable-only", "off"])
export type SkillState = typeof SkillState.Type

// A row's state also covers skills parked in ~/.claude/skills-disabled.
export type RowState = SkillState | "parked"

export type SkillSource = "personal" | "synced" | "command" | "parked" | "project" | "plugin"

export interface SkillRow {
  readonly id: string
  readonly name: string
  readonly invoke: string
  readonly source: SkillSource
  readonly scope: string
  readonly dir: string
  readonly description: string
  readonly whenToUse: string
  readonly state: RowState
  readonly locked: "plugin" | "frontmatter" | null
  readonly userInvocable: boolean
  readonly modelInvocable: boolean
  readonly listingChars: number
  readonly listingTokens: number
  readonly bodyTokens: number
  readonly settingsFile: string | null
  readonly symlink: boolean
}

export interface SkillTotals {
  readonly listingTokens: number
  readonly listingChars: number
  readonly on: number
  readonly off: number
  readonly parked: number
  readonly budgetChars: number
  readonly budgetTokens: number
  readonly overBudget: boolean
  readonly effectiveTokens: number
}

export interface SkillsListing {
  readonly skills: ReadonlyArray<SkillRow>
  readonly totals: SkillTotals
  readonly warnings: ReadonlyArray<string>
}

export const SetSkillState = Schema.Struct({ id: Schema.String, state: SkillState })
export const SetSkillPlugin = Schema.Struct({ id: Schema.String, enabled: Schema.Boolean })
export const RestoreSkill = Schema.Struct({ id: Schema.String })
