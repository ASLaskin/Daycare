// Effort options for select elements.

import { CLAUDE_DEFAULT_EFFORT, EFFORT_CHOICES } from "../shared/efforts.ts"
import { SAME_AS_MASTER } from "../shared/models.ts"
import { el } from "./dom.ts"

// Each effort level with what it is best for
export const renderEffortGuide = (host: HTMLElement) =>
  host.replaceChildren(
    ...EFFORT_CHOICES.flatMap((c) => [el("span", "model-guide-name", c.label), el("span", "model-guide-text", `Best for ${c.bestFor}`)]),
  )

export const MASTER_EFFORT_CHOICES = [...EFFORT_CHOICES, CLAUDE_DEFAULT_EFFORT]
export const WORKER_EFFORT_CHOICES = [SAME_AS_MASTER, ...EFFORT_CHOICES, CLAUDE_DEFAULT_EFFORT]
