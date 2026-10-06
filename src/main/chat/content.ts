// Pure helpers over stream-json content.

import path from "node:path"
import { arr, at, type Json, type JsonObject, num, obj, str } from "../../shared/json.ts"

const TEXT_MAX = 20000 // per tool result
const STRUCTURED_MAX = 50000

// Context tokens from the last iteration of a turn.
export const usageTokens = (u: Json | undefined): number => {
  const usage = obj(u)
  if (!usage) {
    return 0
  }
  const last = arr(usage["iterations"]).at(-1)
  const n = obj(last) ?? usage
  const tokens = (key: string) => num(n[key]) || 0
  return tokens("input_tokens") + tokens("cache_creation_input_tokens") + tokens("cache_read_input_tokens") + tokens("output_tokens")
}

export const cap = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}... [truncated]` : text)

export const flatten = (content: Json | undefined): string => {
  if (typeof content === "string") {
    return cap(content)
  }
  return cap(
    arr(content)
      .map((p) => str(at(p, "text")) ?? "")
      .filter(Boolean)
      .join("\n"),
  )
}

export const structuredOf = (v: Json | undefined): Json | null => {
  if (v === undefined) {
    return null
  }
  return JSON.stringify(v).length > STRUCTURED_MAX ? { truncated: true } : v
}

const TITLE_FIELDS: ReadonlyArray<readonly [string, (v: Json) => string]> = [
  ["command", (v) => short(v)],
  ["file_path", (v) => path.basename(String(v))],
  ["pattern", (v) => short(v)],
  ["url", (v) => short(v)],
]

const short = (v: Json) => String(v).replace(/\s+/g, " ").slice(0, 80)

export const toolTitle = (name: string, input: Json | undefined): string => {
  const i = obj(input) ?? {}
  const hit = TITLE_FIELDS.find(([key]) => i[key])
  return hit ? `${name}: ${hit[1](i[hit[0]]!)}` : name
}

export const toolResults = (content: ReadonlyArray<Json>): ReadonlyArray<JsonObject> =>
  content.flatMap((p) => {
    const part = obj(p)
    return part && part["type"] === "tool_result" && part["tool_use_id"] ? [part] : []
  })
