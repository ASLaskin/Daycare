// Streams resolved media files to the renderer over a private scheme.

import { protocol } from "electron"
import fs from "node:fs"
import { isMediaPath, MEDIA_SCHEME, mimeOf, pathOfMediaUrl } from "../../shared/media.ts"
import { fileResponse } from "../../shared/fileResponse.ts"

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
  return fileResponse(path, stat.size, mime, req.headers.get("range"))
}

export const handleMedia = (allowed: MediaAllowlist) => protocol.handle(MEDIA_SCHEME, (req) => serve(req, allowed))
