// Skills inventory for Settings and the skills rail.

import { Schema } from "effect"
import type { DirPath, FilePath } from "./ids.ts"
import { SkillId } from "./ids.ts"

export const SkillState = Schema.Literals(["on", "name-only", "user-invocable-only", "off"])
export type SkillState = typeof SkillState.Type

// Skill state, plus parked in skills-disabled
export type RowState = SkillState | "parked"

export type SkillSource = "personal" | "synced" | "command" | "parked" | "project" | "plugin"

export interface SkillRow {
  readonly id: SkillId
  readonly name: string
  readonly invoke: string
  readonly source: SkillSource
  readonly scope: string
  readonly dir: DirPath
  readonly description: string
  readonly whenToUse: string
  readonly state: RowState
  readonly locked: "plugin" | "frontmatter" | null
  readonly userInvocable: boolean
  readonly modelInvocable: boolean
  readonly listingChars: number
  readonly listingTokens: number
  readonly bodyTokens: number
  readonly settingsFile: FilePath | null
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

export const SetSkillState = Schema.Struct({ id: SkillId, state: SkillState })
export const SetSkillPlugin = Schema.Struct({ id: SkillId, enabled: Schema.Boolean })
export const RestoreSkill = Schema.Struct({ id: SkillId })
