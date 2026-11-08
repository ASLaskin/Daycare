// Markdown blocks and inline spans of chat prose. Pure, no IO.

import type { HttpUrl } from "./ids.ts"
import { parseHttpUrl } from "./mentions.ts"

export type Align = "left" | "center" | "right" | null

export type MdBlock =
  | { readonly kind: "para"; readonly text: string }
  | {
      readonly kind: "table"
      readonly head: ReadonlyArray<string>
      readonly align: ReadonlyArray<Align>
      readonly rows: ReadonlyArray<ReadonlyArray<string>>
    }

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly href: string; readonly children: ReadonlyArray<Inline> }
  | { readonly kind: "bold"; readonly children: ReadonlyArray<Inline> }
  | { readonly kind: "em"; readonly children: ReadonlyArray<Inline> }

export type LinkTarget =
  | { readonly kind: "url"; readonly url: HttpUrl }
  | { readonly kind: "path"; readonly path: string }

const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const UNESCAPED_PIPE = /(?<!\\)\|/
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

// Groups: code, link label, angle href, plain href, bold, italic
const INLINE_TOKEN =
  /`([^`\n]+)`|(?<!!)\[([^\]\n]+)\]\((?:<([^<>\n]*)>|([^()\s]*(?:\([^()\s]*\)[^()\s]*)*))\)|\*\*([^*\n]+?)\*\*|(?<![*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![*\w])/g

const splitRow = (line: string): ReadonlyArray<string> =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(UNESCAPED_PIPE)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"))

const alignOf = (cell: string): Align => {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  if (left && right) {
    return "center"
  }
  if (right) {
    return "right"
  }
  return left ? "left" : null
}

const startsTable = (lines: ReadonlyArray<string>, i: number): boolean => {
  const head = lines[i] ?? ""
  const delimiter = lines[i + 1] ?? ""
  return (
    head.includes("|") &&
    delimiter.includes("|") &&
    DELIMITER_ROW.test(delimiter) &&
    splitRow(head).length === splitRow(delimiter).length
  )
}

const paragraph = (lines: ReadonlyArray<string>): ReadonlyArray<MdBlock> => {
  const text = lines.join("\n").replace(/^\n+|\n+$/g, "")
  return text ? [{ kind: "para", text }] : []
}

const fitRow = (cells: ReadonlyArray<string>, width: number): ReadonlyArray<string> =>
  Array.from({ length: width }, (_, i) => cells[i] ?? "")

const blocksFrom = (lines: ReadonlyArray<string>, start: number): ReadonlyArray<MdBlock> => {
  const at = lines.findIndex((_, i) => i >= start && startsTable(lines, i))
  if (at === -1) {
    return paragraph(lines.slice(start))
  }
  const head = splitRow(lines[at] ?? "")
  const align = splitRow(lines[at + 1] ?? "").map(alignOf)
  const stop = lines.findIndex((line, i) => i >= at + 2 && (!line.trim() || !line.includes("|")))
  const end = stop === -1 ? lines.length : stop
  const rows = lines.slice(at + 2, end).map((line) => fitRow(splitRow(line), head.length))
  return [...paragraph(lines.slice(start, at)), { kind: "table", head, align, rows }, ...blocksFrom(lines, end)]
}

// Split prose into paragraphs and GFM tables
export const parseBlocks = (prose: string): ReadonlyArray<MdBlock> => blocksFrom(prose.split("\n"), 0)

const textSpan = (text: string): ReadonlyArray<Inline> => (text ? [{ kind: "text", text }] : [])

const inlineOf = (m: RegExpMatchArray): Inline => {
  const [, code, label, angleHref, plainHref, bold, em] = m
  const href = angleHref ?? plainHref
  if (code !== undefined) {
    return { kind: "code", text: code }
  }
  if (label !== undefined) {
    return { kind: "link", href: href ?? "", children: parseInline(label) }
  }
  if (bold !== undefined) {
    return { kind: "bold", children: parseInline(bold) }
  }
  return { kind: "em", children: parseInline(em ?? "") }
}

// Inline code, links, bold and italic; the rest stays text
export const parseInline = (text: string): ReadonlyArray<Inline> => {
  const { spans, end } = [...text.matchAll(INLINE_TOKEN)].reduce<{ readonly spans: ReadonlyArray<Inline>; readonly end: number }>(
    (acc, m) => {
      const start = m.index ?? 0
      return { spans: [...acc.spans, ...textSpan(text.slice(acc.end, start)), inlineOf(m)], end: start + m[0].length }
    },
    { spans: [], end: 0 },
  )
  return [...spans, ...textSpan(text.slice(end))]
}

const decoded = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

const filePath = (href: string): LinkTarget | null => {
  try {
    const url = new URL(href)
    const local = url.hostname === "" || url.hostname === "localhost"
    const path = decoded(url.pathname)
    return local && path ? { kind: "path", path } : null
  } catch {
    return null
  }
}

// What a markdown link opens; null when it must not be a link
export const linkTarget = (raw: string): LinkTarget | null => {
  const href = raw.replace(/^<(.*)>$/, "$1")
  if (/^file:/i.test(href)) {
    return filePath(href)
  }
  if (URL_SCHEME.test(href)) {
    const url = parseHttpUrl(href)
    return url ? { kind: "url", url } : null
  }
  const path = decoded(href.split(/[?#]/)[0] ?? "")
  return path ? { kind: "path", path } : null
}
