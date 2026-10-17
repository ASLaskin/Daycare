// Urls and path candidates mentioned in chat text. Pure, no IO.

import { asHttpUrl, type HttpUrl } from "./ids.ts"

export type TextPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "url"; readonly text: string; readonly url: HttpUrl }
  | { readonly kind: "path"; readonly text: string }

const INLINE_CODE = /`([^`\n]+)`/g
const URL_START = /https?:\/\/[^\s<>"'`]+/y
const PATH_CHARS = "[^\\s<>\"'`|*?,;:()\\[\\]{}]"
const ROOTED_PATH = new RegExp(`(?:~|\\.{1,2})?\\/${PATH_CHARS}+`, "y")
const RELATIVE_PATH = new RegExp(`[\\w@.-]${PATH_CHARS}*\\/${PATH_CHARS}*`, "y")
const NEXT_WORD = new RegExp(` (${PATH_CHARS}+)`, "y")
const EXTENSION = /\.[A-Za-z0-9]{1,8}$/
const NOT_A_PATH = /[|<>*?"$\n]|:\/\/|^-/

// Http and https only; anything else is rejected
export const parseHttpUrl = (raw: string): HttpUrl | null => {
  try {
    const url = new URL(raw)
    const ok = (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== ""
    return ok ? asHttpUrl(url.href) : null
  } catch {
    return null
  }
}

const trimUrl = (raw: string): string => {
  const trimmed = raw.replace(/[.,;:!?'"]+$/, "")
  const unbalanced = trimmed.endsWith(")") && !trimmed.includes("(")
  return unbalanced ? trimUrl(trimmed.slice(0, -1)) : trimmed
}

const hasExtension = (p: string) => EXTENSION.test(p.replace(/\/+$/, "").split("/").pop() ?? "")

// Inline code that reads like a file or folder path
export const looksLikePath = (raw: string): boolean => {
  const t = raw.trim()
  if (!t || t !== raw || NOT_A_PATH.test(t)) {
    return false
  }
  return t.includes("/") || hasExtension(t)
}

const urlPart = (text: string): TextPart => {
  const url = parseHttpUrl(text)
  return url ? { kind: "url", text, url } : { kind: "text", text }
}

// Join following words while they continue a path, as in `oct 9/a.mp4`
const extendAcrossSpaces = (text: string, start: number, path: string): string => {
  if (/[/.]$/.test(path) || hasExtension(path)) {
    return path
  }
  NEXT_WORD.lastIndex = start + path.length
  const next = NEXT_WORD.exec(text)?.[1]
  if (!next || !next.includes("/") || next.includes("://")) {
    return path
  }
  return extendAcrossSpaces(text, start, `${path} ${next}`)
}

const matchAt = (re: RegExp, text: string, i: number): string | null => {
  re.lastIndex = i
  return re.exec(text)?.[0] ?? null
}

const atBoundary = (text: string, i: number) => i === 0 || /[\s([{"']/.test(text[i - 1] ?? "")

const plainPath = (text: string, i: number): string | null => {
  const rooted = matchAt(ROOTED_PATH, text, i)
  if (rooted && rooted !== "/" && !rooted.startsWith("//")) {
    return extendAcrossSpaces(text, i, rooted).replace(/\.+$/, "")
  }
  const relative = matchAt(RELATIVE_PATH, text, i)?.replace(/\.+$/, "")
  if (!relative || relative.startsWith("/") || !(relative.endsWith("/") || hasExtension(relative))) {
    return null
  }
  return relative
}

const plainToken = (text: string, i: number): TextPart | null => {
  if (!atBoundary(text, i)) {
    return null
  }
  const url = matchAt(URL_START, text, i)
  if (url) {
    return urlPart(trimUrl(url))
  }
  const path = plainPath(text, i)
  return path ? { kind: "path", text: path } : null
}

const pushText = (parts: Array<TextPart>, text: string) => {
  if (!text) {
    return
  }
  const last = parts[parts.length - 1]
  if (last?.kind === "text") {
    parts[parts.length - 1] = { kind: "text", text: last.text + text }
    return
  }
  parts.push({ kind: "text", text })
}

// Prose outside inline code: scan word starts for urls and paths
const plainParts = (text: string): ReadonlyArray<TextPart> => {
  const parts: Array<TextPart> = []
  let i = 0
  let run = 0
  while (i < text.length) {
    const token = plainToken(text, i)
    if (!token || token.kind === "text") {
      i += 1
      continue
    }
    pushText(parts, text.slice(run, i))
    parts.push(token)
    i += token.text.length
    run = i
  }
  pushText(parts, text.slice(run))
  return parts
}

const codeParts = (inner: string): ReadonlyArray<TextPart> => {
  const url = parseHttpUrl(inner)
  if (url && /^https?:\/\//.test(inner)) {
    return [{ kind: "text", text: "`" }, { kind: "url", text: inner, url }, { kind: "text", text: "`" }]
  }
  if (looksLikePath(inner)) {
    return [{ kind: "text", text: "`" }, { kind: "path", text: inner }, { kind: "text", text: "`" }]
  }
  return [{ kind: "text", text: `\`${inner}\`` }]
}

// Split text into plain runs, urls and path candidates
export const tokenize = (text: string): ReadonlyArray<TextPart> => {
  const spans = [...text.matchAll(INLINE_CODE)]
  const { parts, end } = spans.reduce<{ readonly parts: ReadonlyArray<TextPart>; readonly end: number }>(
    (acc, m) => {
      const start = m.index ?? 0
      const before = plainParts(text.slice(acc.end, start))
      return { parts: [...acc.parts, ...before, ...codeParts(m[1] ?? "")], end: start + m[0].length }
    },
    { parts: [], end: 0 },
  )
  return [...parts, ...plainParts(text.slice(end))].reduce<Array<TextPart>>((acc, part) => {
    if (part.kind === "text") {
      pushText(acc, part.text)
      return acc
    }
    acc.push(part)
    return acc
  }, [])
}

export const pathsIn = (text: string): ReadonlyArray<string> => [
  ...new Set(tokenize(text).flatMap((p) => (p.kind === "path" ? [p.text] : []))),
]

export const urlsIn = (text: string): ReadonlyArray<HttpUrl> => [
  ...new Set(tokenize(text).flatMap((p) => (p.kind === "url" ? [p.url] : []))),
]
