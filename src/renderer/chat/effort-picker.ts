// Per chat effort switcher under the composer.

import { CLAUDE_DEFAULT_EFFORT, EFFORT_CHOICES, effortBestFor, effortLabel } from "../../shared/efforts.ts"
import type { SessionView } from "../../shared/session.ts"
import { api } from "../api.ts"
import { fillModels } from "../model-options.ts"
import { errorText, notice } from "./turn.ts"
import type { ChatSession } from "./types.ts"

// Levels, plus the default until one is picked
const choicesFor = (current: string) => (current ? EFFORT_CHOICES : [CLAUDE_DEFAULT_EFFORT, ...EFFORT_CHOICES])

const render = (s: ChatSession, current: string) => {
  fillModels(s.effort, choicesFor(current))
  s.effort.value = current
  const bestFor = effortBestFor(current)
  s.effort.title = bestFor ? `${effortLabel(current)} effort is best for ${bestFor}` : "Effort level for this chat"
}

// Claude effort levels only, so hidden for other providers
export const wireEffortPicker = (s: ChatSession, info: Pick<SessionView, "provider" | "effort">) => {
  if (info.provider !== "claude") {
    s.effort.hidden = true
    return
  }
  let current = info.effort
  render(s, current)
  s.effort.addEventListener("change", () => {
    const next = s.effort.value
    api.chatEffort(s.id, next).then(
      () => {
        current = next
        render(s, next)
      },
      (err: unknown) => {
        render(s, current)
        notice(s, "error", `Could not switch the effort level: ${errorText(err)}`)
      },
    )
  })
}
