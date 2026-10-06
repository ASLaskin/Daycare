import fs from "node:fs"

const textOf = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .filter((c) => c?.type === "text")
        .map((c) => c.text)
        .join("\n")
    : typeof content === "string"
      ? content
      : ""

export const lastAssistantText = (transcriptPath: string | null): string => {
  if (!transcriptPath) return ""
  let lines: Array<string>
  try {
    lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n")
  } catch {
    return ""
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]!)
      if (entry.type !== "assistant") continue
      const text = textOf(entry.message?.content).trim()
      if (text) return text
    } catch {}
  }
  return ""
}

const TAIL_BYTES = 512 * 1024

// Reads only the file's tail.
export const contextTokens = (transcriptPath: string | null): number => {
  if (!transcriptPath) return 0
  let fd: number | undefined
  try {
    fd = fs.openSync(transcriptPath, "r")
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString("utf8").split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]!.includes('"usage"')) continue
      try {
        const entry = JSON.parse(lines[i]!)
        const u = entry.message?.usage
        if (entry.type !== "assistant" || entry.isSidechain || !u) continue
        return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0)
      } catch {}
    }
  } catch {
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
  return 0
}

export const firstLine = (text: string) => (text.split("\n").find((l) => l.trim()) ?? "").slice(0, 90)
