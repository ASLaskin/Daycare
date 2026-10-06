// Permission cards: generic approval, AskUserQuestion, and ExitPlanMode.

import type { ChatEventOf } from "../../shared/chat.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { button, cap, oneLine, prettyInput, rec, str, type ToolLabel, toolLabel, wireToggle } from "./format.ts"
import { capMap, type ChatSession, ensureTurn, errorText, MAX_PERMS, notice, type Perm, stick } from "./state.ts"
import { appendProse, settleThinking } from "./text.ts"

type PermissionEvent = ChatEventOf<"permission">
type Answer = (decision: PermissionDecision, allowed: boolean, label?: string) => void

// A bare allow carries no answer, so these get cards.
const ASK_TOOL = "AskUserQuestion"
const PLAN_TOOL = "ExitPlanMode"
// The CLI refuses a longer answer string.
const ANSWER_MAX = 8192

// The most useful suggestion, in plain words.
const pickSuggestion = (list: ReadonlyArray<unknown>) => {
  const items = list.map(rec).filter((x): x is Record<string, unknown> => x !== null)
  if (!items.length) return null
  const mode = items.find((x) => x["type"] === "setMode" && x["mode"] === "acceptEdits") ?? items.find((x) => x["type"] === "setMode")
  const pick = mode ?? items.find((x) => x["type"] === "addRules") ?? items[0]
  if (!pick) return null
  let label = "Allow and remember"
  const where = pick["destination"] === "session" || !pick["destination"] ? " this session" : ""
  if (pick["type"] === "setMode") {
    label = pick["mode"] === "acceptEdits" ? `Allow and accept edits${where}` : `Allow and switch to ${str(pick["mode"])}${where}`
  } else if (pick["type"] === "addRules" && Array.isArray(pick["rules"])) {
    const r = rec(pick["rules"][0])
    if (r) {
      const what = r["ruleContent"] ? `${str(r["toolName"])}: ${oneLine(r["ruleContent"], 28)}` : str(r["toolName"])
      label = `Always allow ${what}`
    }
  }
  return { label, update: pick }
}

const addAlt = (actions: HTMLElement, buttons: Array<HTMLButtonElement>, ev: PermissionEvent, answer: Answer) => {
  const sug = pickSuggestion(ev.suggestions)
  if (!sug) return
  const alt = button("ghost chat-perm-alt", sug.label)
  actions.append(alt)
  buttons.push(alt)
  alt.addEventListener("click", () => answer({ allow: true, updatedPermissions: [sug.update] }, true, sug.label))
}

interface Question {
  readonly text: string
  readonly header: string
  readonly hint: string
  readonly placeholder: string
  readonly multi: boolean
  readonly typed: boolean
  readonly options: ReadonlyArray<{ readonly label: string; readonly note: string }>
  readonly picked: Set<string>
  free: string
}

// Answers keyed by exact question text; whole input echoed back.
const askQuestions = (input: unknown): Array<Question> | null => {
  const raw = rec(input)?.["questions"]
  if (!Array.isArray(raw) || !raw.length) return null
  const out: Array<Question> = []
  for (const item of raw) {
    const q = rec(item)
    if (!q || typeof q["question"] !== "string" || !q["question"].trim()) return null
    const options = (Array.isArray(q["options"]) ? q["options"] : [])
      .map((o: unknown) => {
        const r = rec(o)
        return r ? { label: String(r["label"] ?? ""), note: str(r["description"]) } : { label: String(o ?? ""), note: "" }
      })
      .filter((o) => o.label)
    // Text and number questions get a field.
    const typed = q["kind"] === "text" || q["kind"] === "number" || !options.length
    out.push({
      text: q["question"],
      header: str(q["header"]),
      hint: str(q["description"]),
      placeholder: str(q["placeholder"]),
      multi: q["multiSelect"] === true && !typed,
      typed,
      options,
      picked: new Set(),
      free: "",
    })
  }
  // A repeated question would overwrite its twin.
  if (new Set(out.map((q) => q.text)).size !== out.length) return null
  return out
}

const pressAll = (opts: HTMLElement, value: boolean) => {
  for (const sib of opts.children) sib.setAttribute("aria-pressed", String(value))
}

// One card per call: the CLI expects one response.
const buildAsk = (ev: PermissionEvent, card: HTMLElement, p: Perm, buttons: Array<HTMLButtonElement>, answer: Answer, questions: Array<Question>) => {
  const many = questions.length > 1
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Needs your answer"), el("span", "chat-perm-name", many ? `${questions.length} questions for you` : "A question for you"))
  card.append(top)

  const send = button("primary small", "Send answer")
  const skip = button("ghost chat-deny", "Skip")
  send.disabled = true

  let sent: Record<string, string | Array<string>> | null = null
  const ready = () => questions.some((q) => q.picked.size || q.free.trim())
  const sync = () => {
    send.disabled = !ready()
  }
  const submit = () => {
    if (p.answered || !ready()) return
    const answers: Record<string, string | Array<string>> = {}
    for (const q of questions) {
      const free = q.free.trim()
      const first = [...q.picked][0]
      if (free) answers[q.text] = free.slice(0, ANSWER_MAX)
      else if (q.multi && q.picked.size) answers[q.text] = [...q.picked]
      else if (first !== undefined) answers[q.text] = first
    }
    sent = answers
    answer({ allow: true, updatedInput: { ...rec(ev.input), answers } }, true)
  }

  for (const q of questions) {
    const box = el("div", "chat-ask-q")
    const head = el("div", "chat-ask-head")
    if (q.header) head.append(el("span", "chat-ask-chip", q.header))
    head.append(el("span", "chat-ask-text", q.text))
    box.append(head)
    if (q.hint) box.append(el("div", "chat-ask-hint", q.hint))

    const opts = el("div", "chat-ask-opts")
    const free = el("input", "chat-ask-free")
    free.type = "text"
    free.placeholder = q.typed ? q.placeholder || "Your answer" : "Something else"
    free.setAttribute("aria-label", q.typed ? q.text : `A different answer for: ${q.text}`)
    free.maxLength = ANSWER_MAX

    for (const o of q.options) {
      const b = button("chat-ask-opt")
      b.setAttribute("aria-pressed", "false")
      b.append(el("span", "chat-ask-opt-label", o.label))
      if (o.note) b.append(el("span", "chat-ask-opt-note", o.note))
      b.addEventListener("click", () => {
        if (q.multi) {
          const on = q.picked.has(o.label)
          if (on) q.picked.delete(o.label)
          else q.picked.add(o.label)
          b.setAttribute("aria-pressed", String(!on))
        } else {
          pressAll(opts, false)
          q.picked.clear()
          q.picked.add(o.label)
          b.setAttribute("aria-pressed", "true")
        }
        q.free = ""
        free.value = ""
        sync()
        // A single plain choice needs no confirm.
        if (!many && !q.multi) submit()
      })
      buttons.push(b)
      opts.append(b)
    }
    if (q.options.length) box.append(opts)

    free.addEventListener("input", () => {
      q.free = free.value
      if (q.free.trim()) {
        q.picked.clear()
        pressAll(opts, false)
      }
      sync()
    })
    free.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault()
        submit()
      }
    })
    box.append(free)
    card.append(box)
  }

  const actions = el("div", "chat-perm-actions")
  actions.append(send, skip)
  card.append(actions)
  buttons.push(send, skip)
  send.addEventListener("click", submit)
  skip.addEventListener("click", () => answer({ allow: false, message: "The user skipped the questions." }, false))

  p.summary = (allowed) => {
    if (!allowed) return "Skipped the questions"
    const parts = Object.entries(sent ?? {}).map(([q, a]) => `${oneLine(q, 40)} ${Array.isArray(a) ? a.join(", ") : a}`)
    return parts.length ? `Answered: ${oneLine(parts.join(" · "), 90)}` : "Answered"
  }
}

// Approve allows as asked; deny message carries feedback.
const buildPlan = (ev: PermissionEvent, card: HTMLElement, p: Perm, buttons: Array<HTMLButtonElement>, answer: Answer) => {
  const i = rec(ev.input) ?? {}
  const text = str(i["plan"])
  const where = str(i["planFilePath"])
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Plan ready"), el("span", "chat-perm-name", "Review the plan"))
  card.append(top)

  if (text.trim()) {
    const body = el("div", "chat-plan-body")
    appendProse(body, cap(text))
    card.append(body)
  } else {
    card.append(el("div", "chat-perm-desc", "This request did not include the plan text."))
  }
  if (where) card.append(el("div", "chat-plan-path", where))

  const note = el("input", "chat-plan-note")
  note.type = "text"
  note.placeholder = "What should change? Optional"
  note.setAttribute("aria-label", "What should change before you approve the plan")
  note.maxLength = ANSWER_MAX
  card.append(note)

  const actions = el("div", "chat-perm-actions")
  const go = button("primary small", "Approve and start")
  const back = button("ghost chat-deny", "Keep planning")
  actions.append(go, back)
  addAlt(actions, buttons, ev, answer)
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

const buildGeneric = (ev: PermissionEvent, card: HTMLElement, buttons: Array<HTMLButtonElement>, answer: Answer, l: ToolLabel) => {
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Needs approval"), el("span", "chat-perm-name", l.name))
  const what = el("div", "chat-perm-what", ev.title && ev.title !== ev.name ? ev.title : l.arg || `Allow ${l.name}?`)
  card.append(top, what)
  if (ev.description) card.append(el("div", "chat-perm-desc", ev.description))

  const inputText = prettyInput(ev.input)
  if (inputText && inputText !== "{}") {
    const more = button("chat-perm-more")
    more.append(el("span", "chat-chev", "›"), el("span", null, "Details"))
    const pre = el("pre", "chat-pre", cap(inputText))
    wireToggle(more, pre)
    card.append(more, pre)
  }

  const actions = el("div", "chat-perm-actions")
  const allow = button("primary small", "Allow")
  const deny = button("ghost chat-deny", "Deny")
  actions.append(allow, deny)
  addAlt(actions, buttons, ev, answer)
  card.append(actions)
  buttons.push(allow, deny)

  allow.addEventListener("click", () => answer({ allow: true }, true))
  deny.addEventListener("click", () => answer({ allow: false, message: "Denied by the user" }, false))
}

export const permission = (s: ChatSession, ev: PermissionEvent) => {
  settleThinking(s)
  if (s.perms.has(ev.requestId)) return
  const turn = ensureTurn(s)
  const l = toolLabel(ev.name, ev.input, ev.title)
  const questions = ev.name === ASK_TOOL ? askQuestions(ev.input) : null
  const isPlan = ev.name === PLAN_TOOL
  const card = el("div", `chat-perm${questions ? " chat-ask" : isPlan ? " chat-plan" : ""}`)
  card.setAttribute("role", "group")
  card.setAttribute("aria-label", questions ? "Questions for you" : isPlan ? "A plan to review" : `Permission request: ${l.name}`)

  const p: Perm = { card, answered: false, name: l.name, what: l.arg, summary: null }
  const buttons: Array<HTMLButtonElement> = []
  const answer: Answer = (decision, allowed, label) => {
    if (p.answered) return
    p.answered = true
    for (const b of buttons) b.disabled = true
    api.chatPermission(s.id, ev.requestId, decision).catch((err: unknown) => {
      notice(s, "error", `Could not send the answer: ${errorText(err)}`)
    })
    resolvePerm(s, ev.requestId, allowed, label)
  }

  if (questions) buildAsk(ev, card, p, buttons, answer, questions)
  else if (isPlan) buildPlan(ev, card, p, buttons, answer)
  else buildGeneric(ev, card, buttons, answer, l)

  s.perms.set(ev.requestId, p)
  capMap(s.perms, MAX_PERMS)
  turn.el.append(card)
  stick(s)
}

// An answered card folds into one line.
export const resolvePerm = (s: ChatSession, requestId: string, allowed: boolean, label?: string) => {
  const p = s.perms.get(requestId)
  if (!p) return
  p.answered = true
  const line = el("div", `chat-perm-done ${allowed ? "allowed" : "denied"}`)
  const text = p.summary
    ? p.summary(allowed, label)
    : `${allowed ? "Allowed" : "Denied"} ${p.name}${p.what ? `: ${oneLine(p.what, 70)}` : ""}${label ? ` (${label.toLowerCase()})` : ""}`
  line.append(el("span", "chat-perm-mark", allowed ? "✓" : "×"), el("span", "chat-perm-text", text))
  p.card.replaceWith(line)
  p.card = line
}
