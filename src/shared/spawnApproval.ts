// A master's worker launch waiting on the user's approval.

import { Option, Schema } from "effect"
import type { Json } from "./json.ts"
import { CLAUDE_DEFAULT_EFFORT, EFFORT_CHOICES, effortLabel } from "./efforts.ts"
import { CLAUDE_DEFAULT, MODEL_CHOICES, type ModelChoice, modelLabel } from "./models.ts"

// Permission event name for spawn approvals
export const SPAWN_APPROVAL_TOOL = "mcp__daycare__spawn_subagent"

export const SpawnApprovalInput = Schema.Struct({
  name: Schema.String,
  task: Schema.String,
  // Proposed launch values, editable before approving
  model: Schema.String,
  effort: Schema.String,
  // What the master asked for, if anything
  requestedModel: Schema.NullOr(Schema.String),
  requestedEffort: Schema.NullOr(Schema.String),
})
export type SpawnApprovalInput = typeof SpawnApprovalInput.Type

// The user's model and effort for the worker
export const SpawnChoice = Schema.Struct({ model: Schema.String, effort: Schema.String })
export type SpawnChoice = typeof SpawnChoice.Type

const withCurrent = (choices: ReadonlyArray<ModelChoice>, current: string, label: (id: string) => string) =>
  choices.some((c) => c.id === current) ? choices : [{ id: current, label: label(current) }, ...choices]

// Picker models, plus the proposed one when it is not an alias
export const spawnModelChoices = (proposed: string) => withCurrent([...MODEL_CHOICES, CLAUDE_DEFAULT], proposed, modelLabel)

// Picker efforts, plus the proposed one when it is not a level
export const spawnEffortChoices = (proposed: string) => withCurrent([...EFFORT_CHOICES, CLAUDE_DEFAULT_EFFORT], proposed, effortLabel)

const decodeChoice = Schema.decodeUnknownOption(SpawnChoice)

// The user's pick, kept to offered values, else the proposal
export const chosenSpawn = (input: SpawnApprovalInput, picked: Json | undefined): SpawnChoice => {
  const proposed = { model: input.model, effort: input.effort }
  const choice = decodeChoice(picked)
  if (Option.isNone(choice)) {
    return proposed
  }
  const { model, effort } = choice.value
  return {
    model: spawnModelChoices(input.model).some((c) => c.id === model) ? model : proposed.model,
    effort: spawnEffortChoices(input.effort).some((c) => c.id === effort) ? effort : proposed.effort,
  }
}
