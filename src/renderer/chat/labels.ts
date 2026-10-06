import type { Json, JsonObject } from "../../shared/json.ts"
import { baseName, oneLine, rec, str } from "./format.ts"

export interface ToolLabel {
  readonly name: string
  readonly arg: string
  readonly full: string
}

// Input field shown as a tool's argument, in priority order
const ARG_FIELDS: ReadonlyArray<readonly [string, (v: Json | undefined) => string]> = [
  ["command", (v) => oneLine(v)],
  ["file_path", baseName],
  ["notebook_path", baseName],
  ["pattern", (v) => oneLine(v)],
  ["url", (v) => oneLine(v)],
  ["path", baseName],
  ["query", (v) => oneLine(v)],
  ["description", (v) => oneLine(v)],
  ["prompt", (v) => oneLine(v)],
]

const argOf = (input: JsonObject, name: string, title: string) => {
  const field = ARG_FIELDS.find(([key]) => input[key])
  if (field) {
    return field[1](input[field[0]])
  }
  return title && title !== name ? oneLine(title) : ""
}

export const toolLabel = (name: string, input: Json | undefined, title: string): ToolLabel => {
  const i = rec(input) ?? {}
  const shown = String(name || "Tool")
    .replace(/^mcp__daycare__/, "")
    .replace(/^mcp__/, "")
    .replace(/_/g, " ")
  const full = i["command"] || i["file_path"] || i["pattern"] || i["url"] || title || ""
  return { name: shown, arg: argOf(i, name, title), full: String(full) }
}

const partText = (c: Json) => {
  if (typeof c === "string") {
    return c
  }
  const r = rec(c)
  if (r?.["type"] === "text") {
    return str(r["text"])
  }
  if (r?.["type"] === "image") {
    return "[image]"
  }
  return ""
}

const json = (v: Json) => JSON.stringify(v, null, 2)

export const contentText = (content: Json | undefined): string => {
  if (content == null) {
    return ""
  }
  if (typeof content === "string") {
    return content
  }
  if (Array.isArray(content)) {
    return content.map(partText).filter(Boolean).join("\n")
  }
  const r = rec(content)
  if (r && typeof r["text"] === "string") {
    return r["text"]
  }
  return json(content)
}

export const prettyInput = (input: Json | undefined): string => {
  if (input == null) {
    return ""
  }
  if (typeof input === "string") {
    return input
  }
  return json(input)
}
