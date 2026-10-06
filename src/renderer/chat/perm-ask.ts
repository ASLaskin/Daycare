import { el } from "../dom.ts"
import type { Question } from "./ask-questions.ts"
import { button } from "./controls.ts"
import { oneLine, rec } from "./format.ts"
import { ANSWER_MAX, type CardParts } from "./perm-types.ts"
import type { Perm } from "./types.ts"

type Answers = Record<string, string | Array<string>>

const pressAll = (opts: HTMLElement, value: boolean) => {
  ;[...opts.children].forEach((sib) => sib.setAttribute("aria-pressed", String(value)))
}

const answerOf = (q: Question): string | Array<string> | undefined => {
  const free = q.free.trim()
  if (free) {
    return free.slice(0, ANSWER_MAX)
  }
  if (q.multi && q.picked.size) {
    return [...q.picked]
  }
  return [...q.picked][0]
}

const collect = (questions: ReadonlyArray<Question>): Answers =>
  Object.fromEntries(
    questions.flatMap((q) => {
      const a = answerOf(q)
      return a === undefined ? [] : [[q.text, a]]
    }),
  )

interface QuestionUi {
  readonly q: Question
  readonly buttons: Array<HTMLButtonElement>
  readonly sync: () => void
  readonly submit: () => void
  // Submit on the first pick of a lone single choice
  readonly autoSubmit: boolean
}

const togglePick = (q: Question, opts: HTMLElement, b: HTMLButtonElement, label: string) => {
  if (q.multi) {
    const on = q.picked.delete(label)
    if (!on) {
      q.picked.add(label)
    }
    b.setAttribute("aria-pressed", String(!on))
    return
  }
  pressAll(opts, false)
  q.picked.clear()
  q.picked.add(label)
  b.setAttribute("aria-pressed", "true")
}

const freeField = (q: Question) => {
  const free = el("input", "chat-ask-free")
  free.type = "text"
  free.placeholder = q.typed ? q.placeholder || "Your answer" : "Something else"
  free.setAttribute("aria-label", q.typed ? q.text : `A different answer for: ${q.text}`)
  free.maxLength = ANSWER_MAX
  return free
}

const questionBox = (ui: QuestionUi) => {
  const { q } = ui
  const box = el("div", "chat-ask-q")
  const head = el("div", "chat-ask-head")
  if (q.header) {
    head.append(el("span", "chat-ask-chip", q.header))
  }
  head.append(el("span", "chat-ask-text", q.text))
  box.append(head)
  if (q.hint) {
    box.append(el("div", "chat-ask-hint", q.hint))
  }
  const opts = el("div", "chat-ask-opts")
  const free = freeField(q)
  q.options.forEach((o) => {
    const b = button("chat-ask-opt")
    b.setAttribute("aria-pressed", "false")
    b.append(el("span", "chat-ask-opt-label", o.label))
    if (o.note) {
      b.append(el("span", "chat-ask-opt-note", o.note))
    }
    b.addEventListener("click", () => {
      togglePick(q, opts, b, o.label)
      q.free = ""
      free.value = ""
      ui.sync()
      if (ui.autoSubmit) {
        ui.submit()
      }
    })
    ui.buttons.push(b)
    opts.append(b)
  })
  if (q.options.length) {
    box.append(opts)
  }
  free.addEventListener("input", () => {
    q.free = free.value
    if (q.free.trim()) {
      q.picked.clear()
      pressAll(opts, false)
    }
    ui.sync()
  })
  free.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault()
      ui.submit()
    }
  })
  box.append(free)
  return box
}

const summaryOf = (sent: Answers | null) => (allowed: boolean) => {
  if (!allowed) {
    return "Skipped the questions"
  }
  const parts = Object.entries(sent ?? {}).map(([q, a]) => `${oneLine(q, 40)} ${Array.isArray(a) ? a.join(", ") : a}`)
  return parts.length ? `Answered: ${oneLine(parts.join(" · "), 90)}` : "Answered"
}

// One card for all questions of one request
export const buildAsk = (parts: CardParts, p: Perm, questions: Array<Question>) => {
  const { ev, card, buttons, answer } = parts
  const many = questions.length > 1
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Needs your answer"), el("span", "chat-perm-name", many ? `${questions.length} questions for you` : "A question for you"))
  card.append(top)

  const send = button("primary small", "Send answer")
  const skip = button("ghost chat-deny", "Skip")
  send.disabled = true

  let sent: Answers | null = null
  const ready = () => questions.some((q) => q.picked.size || q.free.trim())
  const sync = () => {
    send.disabled = !ready()
  }
  const submit = () => {
    if (p.answered || !ready()) {
      return
    }
    const answers = collect(questions)
    sent = answers
    answer({ allow: true, updatedInput: { ...rec(ev.input), answers } }, true)
  }

  card.append(...questions.map((q) => questionBox({ q, buttons, sync, submit, autoSubmit: !many && !q.multi })))

  const actions = el("div", "chat-perm-actions")
  actions.append(send, skip)
  card.append(actions)
  buttons.push(send, skip)
  send.addEventListener("click", submit)
  skip.addEventListener("click", () => answer({ allow: false, message: "The user skipped the questions." }, false))

  p.summary = (allowed) => summaryOf(sent)(allowed)
}
