import { Option, Schema } from "effect"
import type { RequestId } from "../../shared/ids.ts"
import { SPAWN_APPROVAL_TOOL, SpawnApprovalInput } from "../../shared/spawnApproval.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { askQuestions } from "./ask-questions.ts"
import { capMap, MAX_PERMS } from "./caps.ts"
import { oneLine } from "./format.ts"
import { toolLabel } from "./labels.ts"
import { buildAsk } from "./perm-ask.ts"
import { buildGeneric } from "./perm-generic.ts"
import { buildPlan } from "./perm-plan.ts"
import { buildSpawn } from "./perm-spawn.ts"
import type { Answer, CardParts, PermissionEvent } from "./perm-types.ts"
import { stick } from "./scroll.ts"
import { settleThinking } from "./thinking.ts"
import { ensureTurn, errorText, notice } from "./turn.ts"
import type { ChatSession, Perm } from "./types.ts"

// Tools with dedicated answer cards
const ASK_TOOL = "AskUserQuestion"
const PLAN_TOOL = "ExitPlanMode"

type CardKind = "ask" | "plan" | "spawn" | "generic"

const CARD_CLASS: Record<CardKind, string> = { ask: " chat-ask", plan: " chat-plan", spawn: " chat-spawn", generic: "" }

const decodeSpawn = Schema.decodeUnknownOption(SpawnApprovalInput)

// Daycare's own worker approval, else null
const spawnRequest = (ev: PermissionEvent) => (ev.name === SPAWN_APPROVAL_TOOL ? Option.getOrNull(decodeSpawn(ev.input)) : null)

const cardLabel = (kind: CardKind, name: string) => {
  switch (kind) {
    case "ask":
      return "Questions for you"
    case "plan":
      return "A plan to review"
    case "spawn":
      return "A worker to approve"
    case "generic":
      return `Permission request: ${name}`
  }
}

export const permission = (s: ChatSession, ev: PermissionEvent) => {
  settleThinking(s)
  if (s.perms.has(ev.requestId)) {
    return
  }
  const turn = ensureTurn(s)
  const l = toolLabel(ev.name, ev.input, ev.title)
  const questions = ev.name === ASK_TOOL ? askQuestions(ev.input) : null
  const spawn = spawnRequest(ev)
  const kind: CardKind = questions ? "ask" : ev.name === PLAN_TOOL ? "plan" : spawn ? "spawn" : "generic"
  const card = el("div", `chat-perm${CARD_CLASS[kind]}`)
  card.setAttribute("role", "group")
  card.setAttribute("aria-label", cardLabel(kind, l.name))

  const p: Perm = { card, answered: false, name: l.name, what: l.arg, summary: null }
  const buttons: Array<HTMLButtonElement> = []
  const answer: Answer = (decision, allowed, label) => {
    if (p.answered) {
      return
    }
    p.answered = true
    buttons.forEach((b) => (b.disabled = true))
    api.chatPermission(s.id, ev.requestId, decision).catch((err: unknown) => {
      notice(s, "error", `Could not send the answer: ${errorText(err)}`)
    })
    resolvePerm(s, ev.requestId, allowed, label)
  }
  const parts: CardParts = { ev, card, buttons, answer }

  if (questions) {
    buildAsk(parts, p, questions)
  }
  if (kind === "plan") {
    buildPlan(parts, p)
  }
  if (spawn) {
    buildSpawn(parts, p, spawn)
  }
  if (kind === "generic") {
    buildGeneric(parts, l)
  }

  s.perms.set(ev.requestId, p)
  capMap(s.perms, MAX_PERMS)
  turn.el.append(card)
  stick(s)
}

const defaultSummary = (p: Perm, allowed: boolean, label?: string) =>
  `${allowed ? "Allowed" : "Denied"} ${p.name}${p.what ? `: ${oneLine(p.what, 70)}` : ""}${label ? ` (${label.toLowerCase()})` : ""}`

// Fold an answered card into one line
export const resolvePerm = (s: ChatSession, requestId: RequestId, allowed: boolean, label?: string) => {
  const p = s.perms.get(requestId)
  if (!p) {
    return
  }
  p.answered = true
  const line = el("div", `chat-perm-done ${allowed ? "allowed" : "denied"}`)
  const text = p.summary ? p.summary(allowed, label) : defaultSummary(p, allowed, label)
  line.append(el("span", "chat-perm-mark", allowed ? "✓" : "×"), el("span", "chat-perm-text", text))
  p.card.replaceWith(line)
  p.card = line
}
