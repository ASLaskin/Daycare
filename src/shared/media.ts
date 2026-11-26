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

export interface SniffedMedia {
  readonly mimeType: string
  readonly kind: "image" | "video" | "audio"
}

const image = (mimeType: string): SniffedMedia => ({ mimeType, kind: "image" })
const video = (mimeType: string): SniffedMedia => ({ mimeType, kind: "video" })
const audio = (mimeType: string): SniffedMedia => ({ mimeType, kind: "audio" })

// Container brands after ftyp at offset 8
const FTYP_BRANDS: Readonly<Record<string, SniffedMedia>> = {
  isom: video("video/mp4"),
  iso2: video("video/mp4"),
  iso4: video("video/mp4"),
  iso5: video("video/mp4"),
  iso6: video("video/mp4"),
  mp41: video("video/mp4"),
  mp42: video("video/mp4"),
  avc1: video("video/mp4"),
  dash: video("video/mp4"),
  "M4V ": video("video/mp4"),
  "qt  ": video("video/quicktime"),
  "M4A ": audio("audio/mp4"),
  heic: image("image/heic"),
  heix: image("image/heic"),
  mif1: image("image/heif"),
  avif: image("image/avif"),
}

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))

// Bytes at offset equal sig, given as text or numbers
const at = (bytes: Uint8Array, offset: number, sig: string | ReadonlyArray<number>) =>
  typeof sig === "string" ? ascii(bytes, offset, sig.length) === sig : sig.every((b, i) => bytes[offset + i] === b)

const SIGNATURES: ReadonlyArray<readonly [(bytes: Uint8Array) => boolean, SniffedMedia]> = [
  [(b) => at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), image("image/png")],
  [(b) => at(b, 0, [0xff, 0xd8, 0xff]), image("image/jpeg")],
  [(b) => at(b, 0, "GIF8"), image("image/gif")],
  [(b) => at(b, 0, "RIFF") && at(b, 8, "WEBP"), image("image/webp")],
  [(b) => at(b, 0, "BM"), image("image/bmp")],
  [(b) => at(b, 0, [0x1a, 0x45, 0xdf, 0xa3]), video("video/webm")],
  [(b) => at(b, 0, "RIFF") && at(b, 8, "WAVE"), audio("audio/wav")],
  [(b) => at(b, 0, "OggS"), audio("audio/ogg")],
  [(b) => at(b, 0, "fLaC"), audio("audio/flac")],
  [(b) => at(b, 0, "ID3") || at(b, 0, [0xff, 0xfb]), audio("audio/mpeg")],
]

// Media type from leading bytes, never the name
export const sniffMedia = (bytes: Uint8Array): SniffedMedia | null => {
  if (at(bytes, 4, "ftyp")) {
    return FTYP_BRANDS[ascii(bytes, 8, 4)] ?? null
  }
  return SIGNATURES.find(([test]) => test(bytes))?.[1] ?? null
}
