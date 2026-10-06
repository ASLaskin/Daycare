// Chat history rebuilt from a JSONL transcript.

import fs from "node:fs"
import type { ChatEvent } from "../../shared/chat.ts"
import { asToolUseId, type FilePath } from "../../shared/ids.ts"
import { arr, at, type JsonObject, num, obj, str } from "../../shared/json.ts"
import { cap, flatten, structuredOf, toolResults, toolTitle } from "./content.ts"
import { parseLine } from "./framing.ts"

export const HISTORY_MAX = 2000

export const historyFromTranscript = (transcriptPath: FilePath | null): Array<ChatEvent> => {
  if (!transcriptPath) {
    return []
  }
  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, "utf8")
  } catch {
    return []
  }
  return raw
    .split("\n")
    .map(parseLine)
    // Main thread entries only, no subagent turns or CLI notes.
    .filter((e): e is JsonObject => !!e && !e["isSidechain"] && !e["isMeta"])
    .reduce<Array<ChatEvent>>((events, e) => {
      if (e["type"] === "user") {
        events.push(...replayUser(e))
      }
      if (e["type"] === "assistant") {
        events.push(...replayAssistant(e, events.length))
      }
      return events
    }, [])
    .slice(-HISTORY_MAX)
}

const replayUser = (e: JsonObject): ReadonlyArray<ChatEvent> => {
  const content = at(e, "message", "content")
  if (typeof content === "string") {
    return content.trim() ? [{ kind: "user", text: cap(content) }] : []
  }
  if (!Array.isArray(content)) {
    return []
  }
  const results = toolResults(content)
  if (!results.length) {
    // User text sent as content parts.
    const text = flatten(content)
    return text.trim() ? [{ kind: "user", text }] : []
  }
  return results.map(
    (p): ChatEvent => ({
      kind: "tool-end",
      toolUseId: asToolUseId(String(p["tool_use_id"])),
      isError: p["is_error"] === true,
      content: flatten(p["content"]),
      structured: results.length === 1 ? structuredOf(e["toolUseResult"]) : null,
    }),
  )
}

const replayAssistant = (e: JsonObject, count: number): ReadonlyArray<ChatEvent> => {
  // Block id prefix, unique per transcript entry.
  const base = str(e["uuid"]) || str(at(e, "message", "id")) || `t${count}`
  const thinkingTokens = num(at(e, "message", "usage", "output_tokens_details", "thinking_tokens"))
  return arr(at(e, "message", "content")).flatMap((p, i): ReadonlyArray<ChatEvent> => {
    const part = obj(p)
    if (!part) {
      return []
    }
    const block = `${base}:${i}`
    const name = str(part["name"]) ?? ""
    const id = str(part["id"])
    switch (part["type"]) {
      case "text":
        return [{ kind: "text", block, text: str(part["text"]) ?? "" }]
      case "thinking":
        return [{ kind: "thinking", block, text: str(part["thinking"]) ?? "", tokens: thinkingTokens }]
      case "tool_use":
        return id
          ? [
              {
                kind: "tool-start",
                toolUseId: asToolUseId(id),
                name,
                title: toolTitle(name, part["input"]),
                input: part["input"] ?? {},
                parentToolUseId: null,
              },
            ]
          : []
      default:
        return []
    }
  })
}
