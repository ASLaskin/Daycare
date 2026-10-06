import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { contextTokens, firstLine, lastAssistantText } from "../src/main/sessions/transcripts.ts"
import { asFilePath } from "../src/shared/ids.ts"
import type { Json } from "../src/shared/json.ts"

const J = (o: Json) => JSON.stringify(o) + "\n"
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-transcripts-"))
const file = asFilePath(path.join(dir, "t.jsonl"))
fs.writeFileSync(
  file,
  J({ type: "assistant", message: { content: [{ type: "text", text: "Older" }], usage: { input_tokens: 1, output_tokens: 1 } } }) +
    J({ type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "Subagent" }], usage: { input_tokens: 999 } } }) +
    J({ type: "assistant", message: { content: [{ type: "text", text: "\n\nNewest reply\nsecond line" }], usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 } } }) +
    J({ type: "assistant", message: { content: [{ type: "tool_use", id: "x" }] } }) +
    "{truncated",
)

test("lastAssistantText skips tool-only and broken lines", () => {
  expect(lastAssistantText(file)).toBe("Newest reply\nsecond line")
  expect(lastAssistantText(asFilePath(path.join(dir, "missing")))).toBe("")
  expect(lastAssistantText(null)).toBe("")
})

test("contextTokens sums the newest main-thread usage", () => {
  expect(contextTokens(file)).toBe(100)
  expect(contextTokens(null)).toBe(0)
})

test("firstLine is the first non-blank line, capped", () => {
  expect(firstLine("\n\n  \nhello\nworld")).toBe("hello")
  expect(firstLine("x".repeat(200)).length).toBe(90)
})
