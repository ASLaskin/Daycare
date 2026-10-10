// Model options for select elements.

import { CLAUDE_DEFAULT, MODEL_CHOICES, type ModelChoice, SAME_AS_MASTER } from "../shared/models.ts"
import { el } from "./dom.ts"

const option = (c: ModelChoice) => {
  const o = el("option", null, c.label)
  o.value = c.id
  return o
}

export const fillModels = (sel: HTMLSelectElement, choices: ReadonlyArray<ModelChoice>) => sel.replaceChildren(...choices.map(option))

// Each model with what it is best for
export const renderModelGuide = (host: HTMLElement) =>
  host.replaceChildren(
    ...MODEL_CHOICES.flatMap((c) => [el("span", "model-guide-name", c.label), el("span", "model-guide-text", `Best for ${c.bestFor}`)]),
  )

export const MASTER_CHOICES = [...MODEL_CHOICES, CLAUDE_DEFAULT]
export const WORKER_CHOICES = [SAME_AS_MASTER, ...MODEL_CHOICES, CLAUDE_DEFAULT]
