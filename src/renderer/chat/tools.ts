import type { ChatEventOf } from "../../shared/chat.ts"
import { el } from "../dom.ts"
import { capTools } from "./caps.ts"
import { wireToggle } from "./controls.ts"
import { appendDiff } from "./diff.ts"
import { cap, oneLine, rec, str } from "./format.ts"
import { contentText, prettyInput, toolLabel } from "./labels.ts"
import { stick } from "./scroll.ts"
import { settleThinking } from "./thinking.ts"
import { ensureTurn } from "./turn.ts"
import type { ChatSession, ToolCard } from "./types.ts"

const section = (parent: HTMLElement, label: string, node: HTMLElement) => {
  const sec = el("div", "chat-sec")
  sec.append(el("div", "chat-sec-label", label), node)
  parent.append(sec)
}

const note = (parent: HTMLElement, text: string) => parent.append(el("div", "chat-sec-note", text))

// Diff and shell output sections; returns whether any were shown
const structuredSections = (card: ToolCard) => {
  const st = rec(card.structured)
  if (!st) {
    return false
  }
  const patch = st["structuredPatch"]
  const hasPatch = Array.isArray(patch) && patch.length > 0
  if (hasPatch) {
    const d = el("div", "chat-diff-wrap")
    appendDiff(d, patch, str(st["filePath"]))
    section(card.body, "Change", d)
  }
  if (typeof st["stdout"] !== "string" && typeof st["stderr"] !== "string") {
    return hasPatch
  }
  const stdout = str(st["stdout"])
  const stderr = str(st["stderr"])
  if (stdout) {
    section(card.body, "Output", el("pre", "chat-pre", cap(stdout)))
  }
  if (stderr) {
    section(card.body, "Errors", el("pre", "chat-pre err", cap(stderr)))
  }
  if (!stdout && !stderr && !card.isError) {
    note(card.body, "No output")
    return true
  }
  return hasPatch || !!stdout || !!stderr
}

const renderToolBody = (card: ToolCard) => {
  const body = card.body
  body.replaceChildren()
  const inputText = prettyInput(card.input)
  if (inputText && inputText !== "{}") {
    section(body, "Input", el("pre", "chat-pre", cap(inputText)))
  }
  if (!card.done) {
    note(body, "Running")
    return
  }
  const shown = structuredSections(card)
  const text = contentText(card.content)
  if (text && (!shown || card.isError)) {
    section(body, card.isError ? "Error" : "Result", el("pre", card.isError ? "chat-pre err" : "chat-pre", cap(text)))
    return
  }
  if (!shown) {
    note(body, "No output")
  }
}

const newCard = (ev: ChatEventOf<"tool-start">): ToolCard => {
  const l = toolLabel(ev.name, ev.input, ev.title)
  const wrap = el("div", "chat-tool running")
  const head = el("button", "chat-tool-head")
  head.type = "button"
  if (l.full) {
    head.title = l.full
  }
  const arg = el("span", "chat-tool-arg", l.arg)
  const noteEl = el("span", "chat-tool-note")
  head.append(el("span", "chat-tool-status"), el("span", "chat-tool-name", l.name), arg, noteEl, el("span", "chat-chev", "›"))
  const body = el("div", "chat-tool-body")
  const kids = el("div", "chat-tool-kids")
  wrap.append(head, body, kids)
  const card: ToolCard = { wrap, head, arg, note: noteEl, body, kids, input: ev.input, done: false, open: false, isError: false, content: "", structured: null }
  wireToggle(head, body, () => renderToolBody(card))
  head.addEventListener("click", () => {
    card.open = head.getAttribute("aria-expanded") === "true"
  })
  return card
}

// Update an existing card with the complete input
const refreshCard = (card: ToolCard, ev: ChatEventOf<"tool-start">) => {
  const l = toolLabel(ev.name, ev.input, ev.title)
  card.input = ev.input
  card.arg.textContent = l.arg
  card.head.title = l.full
  if (card.open) {
    renderToolBody(card)
  }
}

export const toolStart = (s: ChatSession, ev: ChatEventOf<"tool-start">) => {
  settleThinking(s)
  const existing = s.tools.get(ev.toolUseId)
  if (existing) {
    refreshCard(existing, ev)
    return
  }
  const card = newCard(ev)
  s.tools.set(ev.toolUseId, card)
  capTools(s)
  const parent = ev.parentToolUseId ? s.tools.get(ev.parentToolUseId) : undefined
  const host = parent ? parent.kids : ensureTurn(s).el
  host.append(card.wrap)
  stick(s)
}

export const toolEnd = (s: ChatSession, ev: ChatEventOf<"tool-end">) => {
  const card = s.tools.get(ev.toolUseId)
  if (!card) {
    return
  }
  card.done = true
  card.isError = ev.isError
  card.content = ev.content
  card.structured = ev.structured
  card.wrap.classList.remove("running")
  card.wrap.classList.add(ev.isError ? "error" : "ok")
  const first = ev.isError
    ? contentText(ev.content)
        .split("\n")
        .find((x) => x.trim())
    : undefined
  if (first) {
    card.note.textContent = oneLine(first, 80)
  }
  if (card.open) {
    renderToolBody(card)
  }
  stick(s)
}
