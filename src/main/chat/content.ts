// Pure helpers over stream-json content.

import path from "node:path"

const TEXT_MAX = 20000 // per tool result
const STRUCTURED_MAX = 50000

export type Json = Record<string, any>
export const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null

// The last iteration, not the turn's sum.
export const usageTokens = (u: unknown): number => {
  if (!isObject(u)) return 0
  const iters = Array.isArray(u["iterations"]) ? u["iterations"] : []
  const last = iters[iters.length - 1]
  const n = isObject(last) ? last : u
  return (n["input_tokens"] || 0) + (n["cache_creation_input_tokens"] || 0) + (n["cache_read_input_tokens"] || 0) + (n["output_tokens"] || 0)
}

export const cap = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}... [truncated]` : text)

export const flatten = (content: unknown): string => {
  if (typeof content === "string") return cap(content)
  if (!Array.isArray(content)) return ""
  return cap(
    content
      .map((p) => (isObject(p) && typeof p["text"] === "string" ? p["text"] : ""))
      .filter(Boolean)
      .join("\n"),
  )
}

export const structuredOf = (v: unknown): unknown => {
  if (v === undefined) return null
  try {
    return JSON.stringify(v).length > STRUCTURED_MAX ? { truncated: true } : v
  } catch {
    return null
  }
}

export const toolTitle = (name: string, input: unknown): string => {
  const i = isObject(input) ? input : {}
  const short = (v: unknown) => String(v).replace(/\s+/g, " ").slice(0, 80)
  if (i["command"]) return `${name}: ${short(i["command"])}`
  if (i["file_path"]) return `${name}: ${path.basename(String(i["file_path"]))}`
  if (i["pattern"]) return `${name}: ${short(i["pattern"])}`
  if (i["url"]) return `${name}: ${short(i["url"])}`
  return name
}

export const toolResults = (content: ReadonlyArray<unknown>) =>
  content.filter((p): p is Json => isObject(p) && p["type"] === "tool_result" && !!p["tool_use_id"])
