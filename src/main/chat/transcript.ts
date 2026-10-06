// Resumed sessions replay their JSONL transcript.

import fs from "node:fs"
import type { ChatEvent } from "../../shared/chat.ts"
import { cap, flatten, isObject, type Json, structuredOf, toolResults, toolTitle } from "./content.ts"
import { parseLine } from "./framing.ts"

export const HISTORY_MAX = 2000

export const historyFromTranscript = (transcriptPath: string | null): Array<ChatEvent> => {
  if (!transcriptPath) return []
  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, "utf8")
  } catch {
    return []
  }
  const events: Array<ChatEvent> = []
  for (const line of raw.split("\n")) {
    const e = parseLine(line)
    // Skip subagent turns and CLI notes.
    if (!e || e["isSidechain"] || e["isMeta"]) continue
    if (e["type"] === "user") replayUser(events, e)
    else if (e["type"] === "assistant") replayAssistant(events, e)
  }
  return events.slice(-HISTORY_MAX)
}

const replayUser = (events: Array<ChatEvent>, e: Json) => {
  const content = e["message"]?.content
  if (typeof content === "string") {
    if (content.trim()) events.push({ kind: "user", text: cap(content) })
    return
  }
  if (!Array.isArray(content)) return
  const results = toolResults(content)
  for (const p of results) {
    events.push({
      kind: "tool-end",
      toolUseId: p["tool_use_id"],
      isError: p["is_error"] === true,
      content: flatten(p["content"]),
      structured: results.length === 1 ? structuredOf(e["toolUseResult"]) : null,
    })
  }
  // Interrupts and resumes arrive as parts.
  if (!results.length) {
    const text = flatten(content)
    if (text.trim()) events.push({ kind: "user", text })
  }
}

const replayAssistant = (events: Array<ChatEvent>, e: Json) => {
  const content = e["message"]?.content
  if (!Array.isArray(content)) return
  // Entries share a message id; use uuid.
  const base = e["uuid"] || e["message"]?.id || `t${events.length}`
  const thinkingTokens = e["message"]?.usage?.output_tokens_details?.thinking_tokens
  content.forEach((part, i) => {
    if (!isObject(part)) return
    const block = `${base}:${i}`
    if (part["type"] === "text") events.push({ kind: "text", block, text: part["text"] || "" })
    else if (part["type"] === "thinking") {
      events.push({ kind: "thinking", block, text: part["thinking"] || "", tokens: typeof thinkingTokens === "number" ? thinkingTokens : null })
    } else if (part["type"] === "tool_use" && part["id"]) {
      events.push({
        kind: "tool-start",
        toolUseId: part["id"],
        name: part["name"] || "",
        title: toolTitle(part["name"] || "", part["input"]),
        input: part["input"] ?? {},
        parentToolUseId: null,
      })
    }
  })
}
