// Claude effort levels offered in pickers.

import type { ModelChoice } from "./models.ts"

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const
export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export const isEffortLevel = (s: string): s is EffortLevel => EFFORT_LEVELS.some((l) => l === s)

export const EFFORT_CHOICES: ReadonlyArray<ModelChoice> = [
  { id: "low", label: "Low", bestFor: "quick lookups and simple, mechanical edits" },
  { id: "medium", label: "Medium", bestFor: "routine coding, scripted pipelines, and most media work" },
  { id: "high", label: "High", bestFor: "multi step changes that need real thought" },
  { id: "xhigh", label: "Extra high", bestFor: "hard bugs that resisted a lower level" },
  { id: "max", label: "Max", bestFor: "rare, deep reasoning and design problems" },
]

// Empty effort means the model's default
export const CLAUDE_DEFAULT_EFFORT: ModelChoice = { id: "", label: "Default effort" }

const findChoice = (id: string) => [...EFFORT_CHOICES, CLAUDE_DEFAULT_EFFORT].find((c) => c.id === id)

export const effortLabel = (id: string) => findChoice(id)?.label ?? id

export const effortBestFor = (id: string) => findChoice(id)?.bestFor ?? ""

// Guidance line for the master, e.g. "low" for quick lookups
export const EFFORT_GUIDE = EFFORT_CHOICES.map((c) => `"${c.id}" for ${c.bestFor}`).join(", ")
