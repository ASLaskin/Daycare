// Per chat model switcher under the composer.

import { MODEL_CHOICES, modelBestFor, modelLabel } from "../../shared/models.ts"
import { api } from "../api.ts"
import { fillModels } from "../model-options.ts"
import { errorText, notice } from "./turn.ts"
import type { ChatSession } from "./types.ts"

// Aliases, plus the current model when it is not one
const choicesFor = (current: string) =>
  MODEL_CHOICES.some((c) => c.id === current) ? MODEL_CHOICES : [{ id: current, label: modelLabel(current) }, ...MODEL_CHOICES]

const render = (s: ChatSession, current: string) => {
  fillModels(s.model, choicesFor(current))
  s.model.value = current
  const bestFor = modelBestFor(current)
  s.model.title = bestFor ? `${modelLabel(current)} is best for ${bestFor}` : "Model for this chat"
}

export const wireModelPicker = (s: ChatSession, initial: string) => {
  let current = initial
  render(s, current)
  s.model.addEventListener("change", () => {
    const next = s.model.value
    api.chatModel(s.id, next).then(
      () => {
        current = next
        render(s, next)
      },
      (err: unknown) => {
        render(s, current)
        notice(s, "error", `Could not switch the model: ${errorText(err)}`)
      },
    )
  })
}
