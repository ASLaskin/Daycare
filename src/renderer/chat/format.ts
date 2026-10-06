import { settings } from "../store.ts"

export type Json = Record<string, unknown>

// Characters of any one tool output kept in the DOM.
export const MAX_TEXT = 20000

export const rec = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null)
export const str = (v: unknown): string => (typeof v === "string" ? v : "")

export const fmtTokens = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const fmtCost = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`
export const baseName = (p: unknown) =>
  String(p)
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || String(p)

export const oneLine = (v: unknown, n = 90) => {
  const t = String(v).replace(/\s+/g, " ").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export const cap = (t: unknown) => {
  const s = typeof t === "string" ? t : String(t ?? "")
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… output truncated (${s.length - MAX_TEXT} more characters)` : s
}

export type Level = "red" | "amber" | "green"

export const contextLevel = (tokens: number): Level => {
  const limit = settings().contextLimit || 150000
  if (tokens >= limit) return "red"
  if (tokens >= limit * 0.66) return "amber"
  return "green"
}

export interface ToolLabel {
  readonly name: string
  readonly arg: string
  readonly full: string
}

export const toolLabel = (name: string, input: unknown, title: string): ToolLabel => {
  const i = rec(input) ?? {}
  let arg = ""
  if (i["command"]) arg = oneLine(i["command"])
  else if (i["file_path"]) arg = baseName(i["file_path"])
  else if (i["notebook_path"]) arg = baseName(i["notebook_path"])
  else if (i["pattern"]) arg = oneLine(i["pattern"])
  else if (i["url"]) arg = oneLine(i["url"])
  else if (i["path"]) arg = baseName(i["path"])
  else if (i["query"]) arg = oneLine(i["query"])
  else if (i["description"]) arg = oneLine(i["description"])
  else if (i["prompt"]) arg = oneLine(i["prompt"])
  else if (title && title !== name) arg = oneLine(title)
  const shown = String(name || "Tool")
    .replace(/^mcp__daycare__/, "")
    .replace(/^mcp__/, "")
    .replace(/_/g, " ")
  const full = i["command"] || i["file_path"] || i["pattern"] || i["url"] || title || ""
  return { name: shown, arg, full: String(full) }
}

export const contentText = (content: unknown): string => {
  if (content == null) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c
        const r = rec(c)
        if (r?.["type"] === "text") return str(r["text"])
        if (r?.["type"] === "image") return "[image]"
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  const r = rec(content)
  if (r && typeof r["text"] === "string") return r["text"]
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

export const prettyInput = (input: unknown): string => {
  if (input == null) return ""
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

// Native button, so keyboard reachable.
export const wireToggle = (btn: HTMLElement, panel: HTMLElement, onOpen?: () => void) => {
  btn.setAttribute("aria-expanded", "false")
  panel.hidden = true
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true"
    btn.setAttribute("aria-expanded", String(open))
    panel.hidden = !open
    if (open && onOpen) onOpen()
  })
}

export const button = (cls: string, text?: string) => {
  const b = document.createElement("button")
  b.className = cls
  b.type = "button"
  if (text !== undefined) b.textContent = text
  return b
}
