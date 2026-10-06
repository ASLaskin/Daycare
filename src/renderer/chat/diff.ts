import type { Json } from "../../shared/json.ts"
import { el } from "../dom.ts"
import { rec } from "./format.ts"

const MAX_DIFF_LINES = 400

const DIFF_KIND: Record<string, string> = { "+": "add", "-": "del" }
const diffKind = (t: string) => DIFF_KIND[t[0] ?? ""] ?? "ctx"

const diffLine = (t: string) => el("div", `chat-diff-line ${diffKind(t)}`, t || " ")

// Flatten a structured patch into header and line rows
const patchRows = (patch: ReadonlyArray<Json>): Array<HTMLElement | string> =>
  patch.flatMap((h) => {
    if (typeof h === "string") {
      return [h]
    }
    const hunk = rec(h)
    if (!hunk || !Array.isArray(hunk["lines"])) {
      return []
    }
    const header = el("div", "chat-diff-line hunk", `@@ -${hunk["oldStart"]},${hunk["oldLines"]} +${hunk["newStart"]},${hunk["newLines"]} @@`)
    return [header, ...hunk["lines"].map(String)]
  })

export const appendDiff = (parent: HTMLElement, patch: ReadonlyArray<Json>, filePath: string) => {
  const box = el("div", "chat-diff")
  if (filePath) {
    box.append(el("div", "chat-diff-file", filePath))
  }
  let lines = 0
  const nodes = patchRows(patch).flatMap((r) => {
    if (typeof r !== "string") {
      return [r]
    }
    lines += 1
    return lines <= MAX_DIFF_LINES ? [diffLine(r)] : []
  })
  box.append(...nodes)
  if (lines >= MAX_DIFF_LINES) {
    box.append(el("div", "chat-diff-line hunk", "Diff truncated"))
  }
  parent.append(box)
}
