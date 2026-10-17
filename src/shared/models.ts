// Model aliases offered in pickers.

export interface ModelChoice {
  readonly id: string
  readonly label: string
  readonly bestFor?: string
}

export const MODEL_CHOICES: ReadonlyArray<ModelChoice> = [
  { id: "opus", label: "Opus", bestFor: "hard reasoning, design, and tricky bugs" },
  { id: "sonnet", label: "Sonnet", bestFor: "everyday coding and most tasks" },
  { id: "haiku", label: "Haiku", bestFor: "quick lookups and simple, mechanical edits" },
]

// Empty model means users default model 
export const CLAUDE_DEFAULT: ModelChoice = { id: "", label: "Claude default" }

// Worker model setting that follows the master
export const SAME_AS_MASTER: ModelChoice = { id: "master", label: "Same as master" }

const findChoice = (id: string) => [...MODEL_CHOICES, CLAUDE_DEFAULT].find((c) => c.id === id)

export const modelLabel = (id: string) => findChoice(id)?.label ?? id

export const modelBestFor = (id: string) => findChoice(id)?.bestFor ?? ""

// Guidance line for the master, e.g. "haiku" for quick lookups
export const MODEL_GUIDE = MODEL_CHOICES.map((c) => `"${c.id}" for ${c.bestFor}`).join(", ")
