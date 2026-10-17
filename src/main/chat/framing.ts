// Splits stdout into stream-json lines.

import { type JsonObject, obj, parseJson } from "../../shared/json.ts"

const MAX_LINE = 8 * 1024 * 1024 // longest line kept

export class LineFramer {
  private buf = ""
  private discarding = false

  push(chunk: string): { readonly lines: ReadonlyArray<string>; readonly dropped: boolean } {
    this.buf += chunk
    const lines: Array<string> = []
    let dropped = false
    let start = 0
    let nl: number
    while ((nl = this.buf.indexOf("\n", start)) !== -1) {
      const line = this.buf.slice(start, nl)
      start = nl + 1
      // Newline ending a dropped oversized line.
      if (this.discarding) {
        this.discarding = false
        continue
      }
      if (line.length > MAX_LINE) {
        dropped = true
        continue
      }
      lines.push(line)
    }
    this.buf = this.buf.slice(start)
    if (this.buf.length > MAX_LINE) {
      this.buf = ""
      this.discarding = true
      dropped = true
    }
    if (this.discarding) {
      this.buf = ""
    }
    return { lines, dropped }
  }

  end(): string {
    const rest = this.discarding ? "" : this.buf
    this.buf = ""
    return rest
  }
}

export const parseLine = (line: string): JsonObject | null => {
  if (!line.trim()) {
    return null
  }
  return obj(parseJson(line) ?? undefined)
}
