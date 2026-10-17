// Streams resolved media files to the renderer over a private scheme.

import { protocol } from "electron"
import fs from "node:fs"
import { isMediaPath, MEDIA_SCHEME, mimeOf, pathOfMediaUrl } from "../../shared/media.ts"
import { parseRange } from "./range.ts"

// Before app ready
export const registerMediaScheme = () =>
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }])

// Only paths main resolved from chat may be served
export class MediaAllowlist {
  private readonly paths = new Set<string>()

  allow(path: string) {
    if (isMediaPath(path)) {
      this.paths.add(path)
    }
  }

  has(path: string) {
    return this.paths.has(path)
  }
}

// File backed blob, read lazily as the player pulls bytes
const body = async (path: string, start: number, end: number) => (await fs.openAsBlob(path)).slice(start, end + 1)

const serve = async (req: Request, allowed: MediaAllowlist): Promise<Response> => {
  const path = pathOfMediaUrl(req.url)
  const mime = path ? mimeOf(path) : null
  if (!path || !mime || !allowed.has(path)) {
    return new Response(null, { status: 404 })
  }
  const stat = await fs.promises.stat(path).catch(() => null)
  if (!stat?.isFile()) {
    return new Response(null, { status: 404 })
  }
  const header = req.headers.get("range")
  const base = { "Content-Type": mime, "Accept-Ranges": "bytes" }
  if (!header) {
    return new Response(await body(path, 0, stat.size - 1), { headers: { ...base, "Content-Length": String(stat.size) } })
  }
  const range = parseRange(header, stat.size)
  if (!range) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } })
  }
  return new Response(await body(path, range.start, range.end), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
    },
  })
}

export const handleMedia = (allowed: MediaAllowlist) => protocol.handle(MEDIA_SCHEME, (req) => serve(req, allowed))
