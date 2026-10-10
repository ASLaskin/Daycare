// Prose and code segments, rendered as plain text

import type { DirPath } from "../../shared/ids.ts"
import { el } from "../dom.ts"
import { appendLinked } from "./links.ts"

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

const proseBlock = (text: string, linkCwd: DirPath | null) => {
  if (!linkCwd) {
    return el("div", "chat-prose", text)
  }
  const p = el("div", "chat-prose")
  appendLinked(p, text, linkCwd)
  return p
}

// Links urls and paths when given the session cwd
export const appendProse = (parent: HTMLElement, raw: string, linkCwd: DirPath | null = null) => {
  const segs = parseSegments(raw)
  const nodes = segs.map((seg) => (seg.code ? codeBlock(seg) : proseBlock(seg.text, linkCwd)))
  parent.append(...nodes)
  const lastProse = nodes.filter((_, i) => !segs[i]!.code).pop()
  const tail = (lastProse?.firstChild as Text | null | undefined) ?? null
  return { segs, tail }
}
