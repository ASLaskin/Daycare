// File kinds by extension and the local media url scheme.

import type { FilePath } from "./ids.ts"

export type FileKind = "file" | "image" | "video" | "audio"

export const MEDIA_SCHEME = "daycare-media"
const MEDIA_HOST = "local"

export const MIME_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
}

// Opening these would run code, so they are revealed instead
const RUNNABLE_EXTENSIONS = new Set([
  "app", "command", "sh", "zsh", "bash", "exe", "bat", "cmd", "scpt", "workflow", "pkg", "dmg",
  "jar", "terminal", "tool", "action", "pl", "py", "rb", "js", "mjs", "cjs", "ts", "msi", "apk",
])

export const extensionOf = (p: string): string => {
  const base = p.split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

export const mimeOf = (p: string): string | null => MIME_TYPES[extensionOf(p)] ?? null

export const kindOfPath = (p: string): FileKind => {
  const top = mimeOf(p)?.split("/")[0]
  return top === "image" || top === "video" || top === "audio" ? top : "file"
}

export const isRunnablePath = (p: string): boolean => RUNNABLE_EXTENSIONS.has(extensionOf(p))

export const isMediaPath = (p: string): boolean => kindOfPath(p) !== "file"

// Url the renderer loads a local media file from
export const mediaUrl = (path: FilePath): string =>
  `${MEDIA_SCHEME}://${MEDIA_HOST}${path.split("/").map(encodeURIComponent).join("/")}`

export const pathOfMediaUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw)
    return url.protocol === `${MEDIA_SCHEME}:` && url.host === MEDIA_HOST ? decodeURIComponent(url.pathname) : null
  } catch {
    return null
  }
}
