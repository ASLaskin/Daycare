// One line activity label for a tool call.

import path from "node:path"
import { type Json, obj } from "../../shared/json.ts"

const short = (v: Json) => String(v).replace(/\s+/g, " ").slice(0, 60)

const LABEL_FIELDS: ReadonlyArray<readonly [string, (v: Json) => string]> = [
  ["command", short],
  ["file_path", (v) => path.basename(String(v))],
  ["pattern", short],
  ["url", short],
]

const DAYCARE_TOOL = "mcp__daycare__"

export const describeTool = (name: string, input: Json | undefined) => {
  const i = obj(input) ?? {}
  const hit = LABEL_FIELDS.find(([key]) => i[key])
  if (hit) {
    return `${name}: ${hit[1](i[hit[0]]!)}`
  }
  if (name.startsWith(DAYCARE_TOOL)) {
    return name.replace(DAYCARE_TOOL, "").replace(/_/g, " ")
  }
  return name
}
