// Reads facts from a Claude Code JSONL transcript.

import fs from "node:fs"
import type { FilePath } from "../../shared/ids.ts"
import { arr, at, type Json, type JsonObject, num, obj, parseJson, str } from "../../shared/json.ts"

const TAIL_BYTES = 512 * 1024
const FIRST_LINE_MAX = 90

const textOf = (content: Json | undefined): string => {
  if (typeof content === "string") {
    return content
  }
  return arr(content)
    .filter((c) => at(c, "type") === "text")
    .map((c) => str(at(c, "text")) ?? "")
    .join("\n")
}

const parse = (line: string): JsonObject | null => obj(parseJson(line) ?? undefined)

const assistantText = (line: string): string => {
  const entry = parse(line)
  return entry?.["type"] === "assistant" ? textOf(at(entry, "message", "content")).trim() : ""
}

// Usage of a main thread assistant entry
const mainUsage = (line: string): JsonObject | null => {
  if (!line.includes('"usage"')) {
    return null
  }
  const entry = parse(line)
  const u = obj(at(entry ?? undefined, "message", "usage"))
  if (entry?.["type"] !== "assistant" || entry["isSidechain"] || !u) {
    return null
  }
  return u
}

const readTail = (transcriptPath: FilePath) => {
  const fd = fs.openSync(transcriptPath, "r")
  try {
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    return buf.toString("utf8")
  } finally {
    fs.closeSync(fd)
  }
}

// Text of the last assistant message
export const lastAssistantText = (transcriptPath: FilePath | null): string => {
  if (!transcriptPath) {
    return ""
  }
  let lines: Array<string>
  try {
    lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n")
  } catch {
    return ""
  }
  const line = lines.findLast((l) => assistantText(l))
  return line ? assistantText(line) : ""
}

// Context size from the last main thread usage, read from the tail
export const contextTokens = (transcriptPath: FilePath | null): number => {
  if (!transcriptPath) {
    return 0
  }
  let lines: Array<string>
  try {
    lines = readTail(transcriptPath).split("\n")
  } catch {
    return 0
  }
  const line = lines.findLast((l) => mainUsage(l) !== null)
  const u = line ? mainUsage(line) : null
  if (!u) {
    return 0
  }
  const tokens = (key: string) => num(u[key]) || 0
  return tokens("input_tokens") + tokens("cache_creation_input_tokens") + tokens("cache_read_input_tokens") + tokens("output_tokens")
}

export const firstLine = (text: string) => (text.split("\n").find((l) => l.trim()) ?? "").slice(0, FIRST_LINE_MAX)
