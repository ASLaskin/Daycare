// Whole or ranged file responses for streamed media.

import fs from "node:fs"
import { parseRange } from "./range.ts"

// File backed blob, read lazily as the player pulls bytes
const body = async (path: string, start: number, end: number) => (await fs.openAsBlob(path)).slice(start, end + 1)

// 200, 206 or 416 for a file already allowed and sized
export const fileResponse = async (path: string, size: number, mimeType: string, range: string | null, head = false): Promise<Response> => {
  const base = { "Content-Type": mimeType, "Accept-Ranges": "bytes" }
  if (!range) {
    return new Response(head ? null : await body(path, 0, size - 1), { headers: { ...base, "Content-Length": String(size) } })
  }
  const parsed = parseRange(range, size)
  if (!parsed) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
  }
  return new Response(head ? null : await body(path, parsed.start, parsed.end), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(parsed.end - parsed.start + 1),
      "Content-Range": `bytes ${parsed.start}-${parsed.end}/${size}`,
    },
  })
}
