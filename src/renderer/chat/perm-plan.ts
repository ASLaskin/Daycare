import { el } from "../dom.ts"
import { button } from "./controls.ts"
import { cap, rec, str } from "./format.ts"
import { addAlt } from "./perm-suggest.ts"
import { ANSWER_MAX, type CardParts } from "./perm-types.ts"
import { appendProse } from "./segments.ts"
import type { Perm } from "./types.ts"

const planBody = (text: string) => {
  if (!text.trim()) {
    return el("div", "chat-perm-desc", "This request did not include the plan text.")
  }
  const body = el("div", "chat-plan-body")
  appendProse(body, cap(text))
  return body
}

const feedbackField = () => {
  const note = el("input", "chat-plan-note")
  note.type = "text"
  note.placeholder = "What should change? Optional"
  note.setAttribute("aria-label", "What should change before you approve the plan")
  note.maxLength = ANSWER_MAX
  return note
}

// Plan approval card with optional feedback
export const buildPlan = (parts: CardParts, p: Perm) => {
  const { ev, card, buttons, answer } = parts
  const i = rec(ev.input) ?? {}
  const where = str(i["planFilePath"])
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Plan ready"), el("span", "chat-perm-name", "Review the plan"))
  card.append(top, planBody(str(i["plan"])))
  if (where) {
    card.append(el("div", "chat-plan-path", where))
  }
  const note = feedbackField()
  card.append(note)

  const actions = el("div", "chat-perm-actions")
  const go = button("primary small", "Approve and start")
  const back = button("ghost chat-deny", "Keep planning")
  actions.append(go, back)
  addAlt(actions, parts)
  card.append(actions)
  buttons.push(go, back)

  go.addEventListener("click", () => answer({ allow: true }, true))
  back.addEventListener("click", () => {
    const said = note.value.trim()
    answer({ allow: false, message: said || "The user wants to keep planning. Revise the plan and ask again." }, false)
  })
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault()
      back.click()
    }
  })

  p.summary = (allowed, label) => (allowed ? `Plan approved${label ? ` (${label.toLowerCase()})` : ""}` : "Plan sent back for changes")
}
