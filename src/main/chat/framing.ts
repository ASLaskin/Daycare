// Splits stdout into stream-json lines.

import { isObject, type Json } from "./content.ts"

const MAX_LINE = 8 * 1024 * 1024 // longer lines are dropped

export class LineFramer {
  private buf = ""
  private discarding = false

  push(chunk: string): { readonly lines: ReadonlyArray<string>; readonly dropped: boolean } {
    this.buf += chunk
    const lines: Array<string> = []
    let start = 0
    let nl: number
    while ((nl = this.buf.indexOf("\n", start)) !== -1) {
      const line = this.buf.slice(start, nl)
      start = nl + 1
      // End of the dropped oversized line.
      if (this.discarding) this.discarding = false
      else lines.push(line)
    }
    this.buf = this.buf.slice(start)
    let dropped = false
    if (this.buf.length > MAX_LINE) {
      this.buf = ""
      this.discarding = true
      dropped = true
    }
    if (this.discarding) this.buf = ""
    return { lines, dropped }
  }

  end(): string {
    const rest = this.discarding ? "" : this.buf
    this.buf = ""
    return rest
  }
}

export const parseLine = (line: string): Json | null => {
  if (!line.trim() || line.length > MAX_LINE) return null
  try {
    const msg = JSON.parse(line)
    return isObject(msg) ? msg : null
  } catch {
    return null
  }
}
