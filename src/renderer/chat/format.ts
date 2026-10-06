import { isJsonObject, type Json, type JsonObject } from "../../shared/json.ts"
import { settings } from "../store.ts"

// Characters of one tool output kept in the DOM
export const MAX_TEXT = 20000

export const rec = (v: Json | undefined): JsonObject | null => (isJsonObject(v) ? v : null)
export const str = (v: Json | undefined): string => (typeof v === "string" ? v : "")

export const fmtTokens = (n: number) => {
  if (n >= 1e6) {
    return `${+(n / 1e6).toFixed(2)}M`
  }
  if (n >= 1000) {
    return `${Math.round(n / 1000)}k`
  }
  return String(n)
}

export const fmtCost = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`

export const baseName = (p: Json | undefined) =>
  String(p)
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || String(p)

export const oneLine = (v: Json | undefined, n = 90) => {
  const t = String(v).replace(/\s+/g, " ").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export const cap = (t: Json | undefined) => {
  const s = typeof t === "string" ? t : String(t ?? "")
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… output truncated (${s.length - MAX_TEXT} more characters)` : s
}

export type Level = "red" | "amber" | "green"

export const contextLevel = (tokens: number): Level => {
  const limit = settings().contextLimit || 150000
  if (tokens >= limit) {
    return "red"
  }
  if (tokens >= limit * 0.66) {
    return "amber"
  }
  return "green"
}
