// Files, folders and urls a session mentioned. Pure, no IO.

import { Schema } from "effect"
import type { ChatEvent } from "./chat.ts"
import { DirPath, FilePath, type HttpUrl, type ToolUseId } from "./ids.ts"
import { at, str } from "./json.ts"
import { type FileKind, kindOfPath } from "./media.ts"
import { pathsIn, urlsIn } from "./mentions.ts"

// A mentioned path main found on disk
export const ResolvedPath = Schema.Struct({ raw: Schema.String, path: FilePath, isDir: Schema.Boolean })
export type ResolvedPath = typeof ResolvedPath.Type

export const ResolveRequest = Schema.Struct({ cwd: DirPath, paths: Schema.Array(Schema.String) })
export type ResolveRequest = typeof ResolveRequest.Type

export interface FileAttachment {
  readonly kind: FileKind | "folder"
  readonly key: string
  readonly path: FilePath
  readonly name: string
  readonly dir: string
}

export interface UrlAttachment {
  readonly kind: "url"
  readonly key: string
  readonly url: HttpUrl
  readonly host: string
  readonly title: string
}

export type Attachment = FileAttachment | UrlAttachment

export type AttachmentGroup = "images" | "videos" | "files" | "folders" | "urls"
export type AttachmentFilter = "all" | AttachmentGroup

export const GROUPS: ReadonlyArray<{ readonly id: AttachmentGroup; readonly label: string }> = [
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "files", label: "Files" },
  { id: "folders", label: "Folders" },
  { id: "urls", label: "URLs" },
]

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"])

export const groupOf = (a: Attachment): AttachmentGroup => {
  switch (a.kind) {
    case "url":
      return "urls"
    case "folder":
      return "folders"
    case "image":
      return "images"
    case "video":
      return "videos"
    default:
      return "files"
  }
}

export const matchesFilter = (a: Attachment, filter: AttachmentFilter): boolean => filter === "all" || groupOf(a) === filter

export const pathAttachment = (r: ResolvedPath): FileAttachment => {
  const trimmed = r.path.replace(/\/+$/, "")
  const slash = trimmed.lastIndexOf("/")
  return {
    kind: r.isDir ? "folder" : kindOfPath(r.path),
    key: r.path,
    path: r.path,
    name: trimmed.slice(slash + 1) || "/",
    dir: slash > 0 ? trimmed.slice(0, slash) : "/",
  }
}

const decodeSafe = (s: string): string => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export const urlAttachment = (url: HttpUrl): UrlAttachment => {
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^www\./, "")
  const last = decodeSafe(parsed.pathname.split("/").filter(Boolean).pop() ?? "")
  return { kind: "url", key: url, url, host, title: last.replace(/[-_]+/g, " ") || host }
}

// Mentions one chat event carries, before checking the disk
export interface EventMentions {
  readonly urls: ReadonlyArray<HttpUrl>
  readonly paths: ReadonlyArray<string>
  readonly written: { readonly toolUseId: ToolUseId; readonly path: string } | null
}

const NONE: EventMentions = { urls: [], paths: [], written: null }

const textMentions = (text: string): EventMentions => ({ urls: urlsIn(text), paths: pathsIn(text), written: null })

export const mentionsOf = (ev: ChatEvent): EventMentions => {
  switch (ev.kind) {
    case "text":
    case "user":
      return textMentions(ev.text)
    case "tool-start": {
      const path = WRITE_TOOLS.has(ev.name) ? (str(at(ev.input, "file_path")) ?? str(at(ev.input, "notebook_path"))) : null
      return path ? { ...NONE, written: { toolUseId: ev.toolUseId, path } } : NONE
    }
    default:
      return NONE
  }
}
