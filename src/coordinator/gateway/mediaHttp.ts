// GET /media/<session>?path=: one servable file, Range aware.

import { stat } from "node:fs/promises"
import path from "node:path"
import { fileResponse } from "../../shared/fileResponse.ts"
import { asSessionId } from "../../shared/ids.ts"
import type { Hub } from "../hub.ts"
import { type Auth, bearer } from "./auth.ts"

export const MEDIA_PREFIX = "/media/"

const status = (code: number, headers: Record<string, string> = {}) => new Response(null, { status: code, headers })

const decoded = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

export const serveMedia = async (req: Request, url: URL, hub: Pick<Hub, "resolveMedia">, auth: Auth): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return status(405, { Allow: "GET, HEAD" })
  }
  if (!auth.check(bearer(req.headers.get("authorization")))) {
    return status(401, { "WWW-Authenticate": "Bearer" })
  }
  const session = decoded(url.pathname.slice(MEDIA_PREFIX.length))
  const file = url.searchParams.get("path")
  if (!session || !file || !path.isAbsolute(file)) {
    return status(400)
  }
  const item = hub.resolveMedia(asSessionId(session), file)
  const info = item ? await stat(item.path).catch(() => null) : null
  if (!item || !info?.isFile()) {
    return status(404)
  }
  const res = await fileResponse(item.path, info.size, item.mimeType, req.headers.get("range"), req.method === "HEAD")
  res.headers.set("Cache-Control", "private, max-age=60")
  res.headers.set("Last-Modified", info.mtime.toUTCString())
  return res
}
