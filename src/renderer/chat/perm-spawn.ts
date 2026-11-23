import { effortLabel } from "../../shared/efforts.ts"
import { modelLabel } from "../../shared/models.ts"
import { spawnEffortChoices, spawnModelChoices, type SpawnApprovalInput } from "../../shared/spawnApproval.ts"
import { el } from "../dom.ts"
import { fillModels } from "../model-options.ts"
import { button } from "./controls.ts"
import { cap } from "./format.ts"
import type { CardParts } from "./perm-types.ts"
import type { Perm } from "./types.ts"

const picker = (label: string, sel: HTMLSelectElement) => {
  const field = el("label", "chat-spawn-field", label)
  field.append(sel)
  return field
}

// What the master asked for, when it differs from the proposal
const requestNote = (req: SpawnApprovalInput) => {
  const asked = [
    req.requestedModel !== null && req.requestedModel !== req.model ? modelLabel(req.requestedModel) : null,
    req.requestedEffort !== null && req.requestedEffort !== req.effort ? `${effortLabel(req.requestedEffort)} effort` : null,
  ].filter((x) => x !== null)
  return asked.length ? el("div", "chat-perm-desc", `The master asked for ${asked.join(" at ")}; your subagent settings chose the values below.`) : null
}

// Approve a new worker, with its model and effort editable
export const buildSpawn = (parts: CardParts, p: Perm, req: SpawnApprovalInput) => {
  const { card, buttons, answer } = parts
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Needs approval"), el("span", "chat-perm-name", `Start worker ${req.name}`))
  card.append(top, el("div", "chat-spawn-task", cap(req.task)))
  const note = requestNote(req)
  if (note) {
    card.append(note)
  }

  const model = el("select")
  fillModels(model, spawnModelChoices(req.model))
  model.value = req.model
  const effort = el("select")
  fillModels(effort, spawnEffortChoices(req.effort))
  effort.value = req.effort
  const fields = el("div", "chat-spawn-fields")
  fields.append(picker("Model", model), picker("Effort", effort))
  card.append(fields)

  const actions = el("div", "chat-perm-actions")
  const allow = button("primary small", "Start worker")
  const deny = button("ghost chat-deny", "Deny")
  actions.append(allow, deny)
  card.append(actions)
  buttons.push(allow, deny)

  allow.addEventListener("click", () => {
    model.disabled = true
    effort.disabled = true
    answer({ allow: true, updatedInput: { model: model.value, effort: effort.value } }, true)
  })
  deny.addEventListener("click", () => answer({ allow: false, message: "Denied by the user" }, false))

  p.summary = (allowed) => `${allowed ? "Approved" : "Denied"} worker ${req.name}`
}
