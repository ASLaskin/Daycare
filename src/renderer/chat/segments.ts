// Prose and code segments, rendered as markdown

import type { DirPath } from "../../shared/ids.ts"
import { el } from "../dom.ts"
import { parseBlocks, parseInline } from "../../shared/markdown.ts"
import { appendInline, tableNode } from "./markdown.ts"

export interface Segment {
  readonly code: boolean
  readonly text: string
  readonly lang?: string
}

interface ParseState {
  readonly segs: Array<Segment>
  prose: Array<string>
  code: Array<string> | null
  lang: string
}

const flushProse = (st: ParseState) => {
  const t = st.prose.join("\n").replace(/^\n+|\n+$/g, "")
  if (t) {
    st.segs.push({ code: false, text: t })
  }
  st.prose = []
}

const readLine = (st: ParseState, line: string) => {
  const fence = /^\s*```(.*)$/.exec(line)
  if (fence && st.code === null) {
    flushProse(st)
    st.code = []
    st.lang = (fence[1] ?? "").trim()
    return
  }
  if (fence && st.code !== null) {
    st.segs.push({ code: true, text: st.code.join("\n"), lang: st.lang })
    st.code = null
    return
  }
  if (st.code !== null) {
    st.code.push(line)
    return
  }
  st.prose.push(line)
}

// Split text into prose and fenced code segments
export const parseSegments = (raw: string): Array<Segment> => {
  const st: ParseState = { segs: [], prose: [], code: null, lang: "" }
  raw.split("\n").forEach((line) => readLine(st, line))
  if (st.code !== null) {
    st.segs.push({ code: true, text: st.code.join("\n"), lang: st.lang })
  }
  flushProse(st)
  return st.segs
}

const codeBlock = (seg: Segment) => {
  const wrap = el("div", "chat-codeblock")
  if (seg.lang) {
    wrap.append(el("div", "chat-codelang", seg.lang))
  }
  wrap.append(el("pre", "chat-code", seg.text))
  return wrap
}

const paragraphNode = (text: string, linkCwd: DirPath | null) => {
  const p = el("div", "chat-prose")
  appendInline(p, parseInline(text), linkCwd)
  return p
}

const proseNodes = (text: string, linkCwd: DirPath | null): ReadonlyArray<HTMLElement> =>
  parseBlocks(text).map((block) => (block.kind === "table" ? tableNode(block, linkCwd) : paragraphNode(block.text, linkCwd)))

// Last text node of the final paragraph, if one ends the prose
const tailOf = (node: HTMLElement | undefined): Text | null => {
  const last = node?.classList.contains("chat-prose") ? node.lastChild : null
  return last instanceof Text ? last : null
}

// Renders markdown prose; links paths when given the session cwd
export const appendProse = (parent: HTMLElement, raw: string, linkCwd: DirPath | null = null) => {
  const segs = parseSegments(raw)
  const nodes = segs.flatMap((seg) => (seg.code ? [codeBlock(seg)] : proseNodes(seg.text, linkCwd)))
  parent.append(...nodes)
  const last = segs[segs.length - 1]
  return { segs, tail: last?.code ? null : tailOf(nodes[nodes.length - 1]) }
}
