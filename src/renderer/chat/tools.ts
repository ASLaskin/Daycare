// Tool call cards, with diffs and output.

import type { ChatEventOf } from "../../shared/chat.ts"
import { el } from "../dom.ts"
import { cap, contentText, oneLine, prettyInput, rec, str, toolLabel, wireToggle } from "./format.ts"
import { capTools, type ChatSession, ensureTurn, stick, type ToolCard } from "./state.ts"
import { settleThinking } from "./text.ts"

const MAX_DIFF_LINES = 400

const diffKind = (t: string) => (t[0] === "+" ? "add" : t[0] === "-" ? "del" : "ctx")

const appendDiff = (parent: HTMLElement, patch: ReadonlyArray<unknown>, filePath: string) => {
  const box = el("div", "chat-diff")
  if (filePath) box.append(el("div", "chat-diff-file", filePath))
  let n = 0
  for (const h of patch) {
    const hunk = rec(h)
    if (hunk && Array.isArray(hunk["lines"])) {
      box.append(el("div", "chat-diff-line hunk", `@@ -${hunk["oldStart"]},${hunk["oldLines"]} +${hunk["newStart"]},${hunk["newLines"]} @@`))
      for (const line of hunk["lines"]) {
        if (n++ >= MAX_DIFF_LINES) break
        const t = String(line)
        box.append(el("div", `chat-diff-line ${diffKind(t)}`, t || " "))
      }
    } else if (typeof h === "string") {
      if (n++ >= MAX_DIFF_LINES) break
      box.append(el("div", `chat-diff-line ${diffKind(h)}`, h || " "))
    }
  }
  if (n >= MAX_DIFF_LINES) box.append(el("div", "chat-diff-line hunk", "Diff truncated"))
  parent.append(box)
}

const section = (parent: HTMLElement, label: string, node: HTMLElement) => {
  const sec = el("div", "chat-sec")
  sec.append(el("div", "chat-sec-label", label), node)
  parent.append(sec)
}

const renderToolBody = (card: ToolCard) => {
  const body = card.body
  body.replaceChildren()
  const inputText = prettyInput(card.input)
  if (inputText && inputText !== "{}") section(body, "Input", el("pre", "chat-pre", cap(inputText)))

  if (!card.done) {
    body.append(el("div", "chat-sec-note", "Running"))
    return
  }

  const st = rec(card.structured)
  let shown = false
  const patch = st?.["structuredPatch"]
  if (st && Array.isArray(patch) && patch.length) {
    const d = el("div", "chat-diff-wrap")
    appendDiff(d, patch, str(st["filePath"]))
    section(body, "Change", d)
    shown = true
  }
  if (st && (typeof st["stdout"] === "string" || typeof st["stderr"] === "string")) {
    const stdout = str(st["stdout"])
    const stderr = str(st["stderr"])
    if (stdout) {
      section(body, "Output", el("pre", "chat-pre", cap(stdout)))
      shown = true
    }
    if (stderr) {
      section(body, "Errors", el("pre", "chat-pre err", cap(stderr)))
      shown = true
    }
    if (!stdout && !stderr && !card.isError) {
      body.append(el("div", "chat-sec-note", "No output"))
      shown = true
    }
  }
  const text = contentText(card.content)
  if (text && (!shown || card.isError)) {
    section(body, card.isError ? "Error" : "Result", el("pre", card.isError ? "chat-pre err" : "chat-pre", cap(text)))
  } else if (!shown) body.append(el("div", "chat-sec-note", "No output"))
}

export const toolStart = (s: ChatSession, ev: ChatEventOf<"tool-start">) => {
  settleThinking(s)
  const l = toolLabel(ev.name, ev.input, ev.title)
  const existing = s.tools.get(ev.toolUseId)
  // Streamed start followed by the complete one.
  if (existing) {
    existing.input = ev.input
    existing.arg.textContent = l.arg
    existing.head.title = l.full
    if (existing.open) renderToolBody(existing)
    return
  }
  const wrap = el("div", "chat-tool running")
  const head = el("button", "chat-tool-head")
  head.type = "button"
  if (l.full) head.title = l.full
  const arg = el("span", "chat-tool-arg", l.arg)
  const note = el("span", "chat-tool-note")
  head.append(el("span", "chat-tool-status"), el("span", "chat-tool-name", l.name), arg, note, el("span", "chat-chev", "›"))
  const body = el("div", "chat-tool-body")
  const kids = el("div", "chat-tool-kids")
  wrap.append(head, body, kids)
  const card: ToolCard = { wrap, head, arg, note, body, kids, input: ev.input, done: false, open: false, isError: false, content: "", structured: null }
  wireToggle(head, body, () => renderToolBody(card))
  head.addEventListener("click", () => {
    card.open = head.getAttribute("aria-expanded") === "true"
  })
  s.tools.set(ev.toolUseId, card)
  capTools(s)

  const parent = ev.parentToolUseId ? s.tools.get(ev.parentToolUseId) : undefined
  if (parent) parent.kids.append(wrap)
  else ensureTurn(s).el.append(wrap)
  stick(s)
}

// No epoch bump: it duplicated text blocks.
export const toolEnd = (s: ChatSession, ev: ChatEventOf<"tool-end">) => {
  const card = s.tools.get(ev.toolUseId)
  if (!card) return
  card.done = true
  card.isError = ev.isError
  card.content = ev.content
  card.structured = ev.structured
  card.wrap.classList.remove("running")
  card.wrap.classList.add(ev.isError ? "error" : "ok")
  if (ev.isError) {
    const first = contentText(ev.content)
      .split("\n")
      .find((x) => x.trim())
    if (first) card.note.textContent = oneLine(first, 80)
  }
  if (card.open) renderToolBody(card)
  stick(s)
}
