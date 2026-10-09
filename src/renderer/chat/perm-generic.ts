import type { Json } from "../../shared/json.ts"
import { el } from "../dom.ts"
import { button, wireToggle } from "./controls.ts"
import { cap } from "./format.ts"
import { prettyInput, type ToolLabel } from "./labels.ts"
import { addAlt } from "./perm-suggest.ts"
import type { CardParts } from "./perm-types.ts"

const details = (card: HTMLElement, input: Json) => {
  const inputText = prettyInput(input)
  if (!inputText || inputText === "{}") {
    return
  }
  const more = button("chat-perm-more")
  more.append(el("span", "chat-chev", "›"), el("span", null, "Details"))
  const pre = el("pre", "chat-pre", cap(inputText))
  wireToggle(more, pre)
  card.append(more, pre)
}

const CHOICE_LABEL: Readonly<Record<string, string>> = {
  accept: "Allow",
  acceptForSession: "Allow for this session",
  acceptWithExecpolicyAmendment: "Allow and remember this command",
  decline: "Deny",
  cancel: "Deny and stop the turn",
}
const REFUSALS = new Set(["decline", "cancel", "deny"])
// Claude's answers, which the Allow, Always and Deny buttons already cover
const CLAUDE_CHOICES = new Set(["allow", "always", "deny"])

// One button per answer the request offers
const choiceButtons = (actions: HTMLElement, { buttons, answer }: CardParts, choices: ReadonlyArray<string>) => {
  const firstAllow = choices.find((c) => !REFUSALS.has(c))
  choices.forEach((choice) => {
    const refuse = REFUSALS.has(choice)
    const label = CHOICE_LABEL[choice] ?? choice
    const b = button(refuse ? "ghost chat-deny" : choice === firstAllow ? "primary small" : "ghost", label)
    b.addEventListener("click", () =>
      answer({ allow: !refuse, choice, ...(refuse ? { message: "Denied by the user" } : {}) }, !refuse, label),
    )
    actions.append(b)
    buttons.push(b)
  })
}

// Allow or deny card for an ordinary tool
export const buildGeneric = (parts: CardParts, l: ToolLabel) => {
  const { ev, card, buttons, answer } = parts
  const top = el("div", "chat-perm-top")
  top.append(el("span", "chat-perm-badge", "Needs approval"), el("span", "chat-perm-name", l.name))
  const what = el("div", "chat-perm-what", ev.title && ev.title !== ev.name ? ev.title : l.arg || `Allow ${l.name}?`)
  card.append(top, what)
  if (ev.description) {
    card.append(el("div", "chat-perm-desc", ev.description))
  }
  details(card, ev.input)

  const actions = el("div", "chat-perm-actions")
  const offered = ev.choices?.some((c) => !CLAUDE_CHOICES.has(c)) ? ev.choices : undefined
  if (offered) {
    choiceButtons(actions, parts, offered)
    card.append(actions)
    return
  }
  const allow = button("primary small", "Allow")
  const deny = button("ghost chat-deny", "Deny")
  actions.append(allow, deny)
  addAlt(actions, parts)
  card.append(actions)
  buttons.push(allow, deny)

  allow.addEventListener("click", () => answer({ allow: true }, true))
  deny.addEventListener("click", () => answer({ allow: false, message: "Denied by the user" }, false))
}
