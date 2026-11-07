import { asFilePath, type DirPath } from "../../shared/ids.ts"
import { type Align, type Inline, linkTarget, type LinkTarget, type MdBlock, parseInline } from "../../shared/markdown.ts"
import { looksLikePath, parseHttpUrl } from "../../shared/mentions.ts"
import { openPath, openUrl } from "../attachments/open.ts"
import { resolvePaths } from "../attachments/resolve.ts"
import { el } from "../dom.ts"
import { toast } from "../toast.ts"
import { appendLinked, linkPaths, makeLink } from "./links.ts"

const openRelative = async (path: string, cwd: DirPath) => {
  const hit = (await resolvePaths(cwd, [path]))[0]
  if (!hit) {
    toast("Path not found")
    return
  }
  await openPath(hit.path)
}

const openTarget = (target: LinkTarget, cwd: DirPath | null): (() => void) | null => {
  if (target.kind === "url") {
    return () => void openUrl(target.url)
  }
  if (target.path.startsWith("/") || target.path.startsWith("~")) {
    return () => void openPath(asFilePath(target.path))
  }
  return cwd ? () => void openRelative(target.path, cwd) : null
}

const codeNode = (text: string, cwd: DirPath | null) => {
  const node = el("code", "chat-inline-code", text)
  const url = parseHttpUrl(text)
  if (url && /^https?:\/\//.test(text)) {
    makeLink(node, "Open in browser", () => void openUrl(url))
    return node
  }
  if (cwd && looksLikePath(text)) {
    linkPaths([node], cwd)
  }
  return node
}

const inlineNode = (span: Inline, cwd: DirPath | null): Node => {
  switch (span.kind) {
    case "text": {
      if (!cwd) {
        return document.createTextNode(span.text)
      }
      const frag = document.createDocumentFragment()
      appendLinked(frag, span.text, cwd)
      return frag
    }
    case "code":
      return codeNode(span.text, cwd)
    case "bold": {
      const node = el("strong")
      appendInline(node, span.children, cwd)
      return node
    }
    case "em": {
      const node = el("em")
      appendInline(node, span.children, cwd)
      return node
    }
    case "link": {
      const node = el("span")
      appendInline(node, span.children, null)
      const target = linkTarget(span.href)
      const open = target ? openTarget(target, cwd) : null
      if (open) {
        makeLink(node, target?.kind === "url" ? "Open in browser" : "Open file", open)
      }
      return node
    }
  }
}

export const appendInline = (parent: ParentNode, spans: ReadonlyArray<Inline>, cwd: DirPath | null) => {
  parent.append(...spans.map((span) => inlineNode(span, cwd)))
}

const cell = (tag: "th" | "td", text: string, align: Align, cwd: DirPath | null) => {
  const node = el(tag)
  if (align) {
    node.style.textAlign = align
  }
  appendInline(node, parseInline(text), cwd)
  return node
}

const row = (cells: ReadonlyArray<HTMLElement>) => {
  const tr = el("tr")
  tr.append(...cells)
  return tr
}

export const tableNode = (table: Extract<MdBlock, { kind: "table" }>, cwd: DirPath | null) => {
  const head = el("thead")
  head.append(row(table.head.map((text, i) => cell("th", text, table.align[i] ?? null, cwd))))
  const body = el("tbody")
  body.append(...table.rows.map((r) => row(r.map((text, i) => cell("td", text, table.align[i] ?? null, cwd)))))
  const node = el("table", "chat-table")
  node.append(head, body)
  const wrap = el("div", "chat-table-wrap")
  wrap.append(node)
  return wrap
}
