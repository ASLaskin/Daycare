// Media files a session's events mention, checked on disk.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { mentionsOf } from "../shared/attachments.ts"
import type { ChatEvent } from "../shared/chat.ts"
import type { Entry, MediaItem } from "../shared/coordinator.ts"
import { asFilePath, type DirPath, type SessionId, type ToolUseId } from "../shared/ids.ts"
import { isJsonObject, type Json } from "../shared/json.ts"
import { isMediaPath, sniffMedia } from "../shared/media.ts"
import { pathsIn } from "../shared/mentions.ts"
import type { HistoryRow } from "../shared/mobile.ts"

const SNIFF_BYTES = 16
const MAX_PATH_LENGTH = 4096

// Every string inside a tool input
const stringsIn = (v: Json): ReadonlyArray<string> => {
  if (typeof v === "string") {
    return [v]
  }
  if (Array.isArray(v)) {
    return v.flatMap(stringsIn)
  }
  return isJsonObject(v) ? Object.values(v).flatMap(stringsIn) : []
}

const TOKEN_BREAKS = /[\s"'`()<>|;,=]+/
// Longer text, such as file contents, gets the cheap token scan only
const PATH_SCAN_MAX = 16 * 1024

// Mentioned paths plus bare names like out.mp4
const pathsAndNames = (text: string): ReadonlyArray<string> => [
  ...(text.length <= PATH_SCAN_MAX ? pathsIn(text) : []),
  ...text.split(TOKEN_BREAKS).map((t) => t.replace(/[.:!?]+$/, "")),
]

// Path strings with a media extension, before touching the disk
export const candidatesOf = (event: ChatEvent): ReadonlyArray<string> => {
  const raw = (() => {
    switch (event.kind) {
      case "tool-start":
        return stringsIn(event.input).flatMap(pathsAndNames)
      case "tool-end":
        return pathsAndNames(event.content)
      case "text":
        return pathsAndNames(event.text)
      default:
        return mentionsOf(event).paths
    }
  })()
  return [...new Set(raw.filter(isMediaPath))]
}

const realpath = (p: string): string | null => {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

const leadingBytes = (file: string): Uint8Array => {
  const fd = fs.openSync(file, "r")
  try {
    const buf = new Uint8Array(SNIFF_BYTES)
    const read = fs.readSync(fd, buf, 0, SNIFF_BYTES, 0)
    return buf.subarray(0, read)
  } finally {
    fs.closeSync(fd)
  }
}

const absolute = (raw: string, cwd: DirPath, home: string): string => {
  const expanded = raw === "~" ? home : raw.startsWith("~/") ? path.join(home, raw.slice(2)) : raw
  return path.isAbsolute(expanded) ? expanded : path.join(cwd, expanded)
}

// Existing regular file whose bytes are media
export const mediaFile = (raw: string, cwd: DirPath, home: string = os.homedir()): Omit<MediaItem, "entry"> | null => {
  if (!raw || raw.length > MAX_PATH_LENGTH || raw.includes("\0")) {
    return null
  }
  const real = realpath(absolute(raw, cwd, home))
  try {
    const stat = real ? fs.statSync(real) : null
    const sniffed = real && stat?.isFile() && stat.size > 0 ? sniffMedia(leadingBytes(real)) : null
    if (!real || !stat || !sniffed) {
      return null
    }
    return { path: asFilePath(real), name: path.basename(real), mimeType: sniffed.mimeType, kind: sniffed.kind, size: stat.size, modifiedAt: stat.mtimeMs }
  } catch {
    return null
  }
}

// File lies inside dir once both are resolved
export const isInside = (file: string, dir: DirPath): boolean => {
  const root = realpath(dir)
  const rel = root ? path.relative(root, file) : ".."
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

export interface MediaDeps {
  readonly cwd: (id: SessionId) => DirPath | null
  readonly rows: (id: SessionId) => ReadonlyArray<HistoryRow>
  readonly home?: string
}

interface Known {
  readonly items: Map<string, MediaItem>
  scanned: boolean
}

const changed = (before: MediaItem | undefined, after: Omit<MediaItem, "entry">) =>
  !before || before.size !== after.size || before.modifiedAt !== after.modifiedAt

export const makeMediaIndex = (deps: MediaDeps) => {
  const home = deps.home ?? os.homedir()
  const known = new Map<SessionId, Known>()
  // Tool start candidates, rechecked once the tool ends
  const pending = new Map<string, ReadonlyArray<string>>()

  const of = (id: SessionId): Known => {
    const found = known.get(id)
    if (found) {
      return found
    }
    const fresh: Known = { items: new Map(), scanned: false }
    known.set(id, fresh)
    return fresh
  }

  const toolKey = (id: SessionId, tool: ToolUseId) => `${id} ${tool}`

  const resolveAll = (raw: ReadonlyArray<string>, cwd: DirPath) =>
    [...new Set(raw)].flatMap((r) => {
      const file = mediaFile(r, cwd, home)
      return file ? [file] : []
    })

  // Every row's mentions, newest entry wins
  const scan = (id: SessionId, cwd: DirPath) => {
    const k = of(id)
    if (k.scanned) {
      return k
    }
    deps.rows(id).forEach((row) =>
      resolveAll(candidatesOf(row.event), cwd).forEach((file) => {
        k.items.set(file.path, { ...file, entry: Math.max(row.entry, k.items.get(file.path)?.entry ?? 0) })
      }),
    )
    k.scanned = true
    return k
  }

  return {
    // Media this event newly reveals, or that changed on disk
    notice: (id: SessionId, entry: Entry, event: ChatEvent): ReadonlyArray<MediaItem> => {
      const cwd = deps.cwd(id)
      const own = candidatesOf(event)
      if (!cwd) {
        return []
      }
      if (event.kind === "tool-start") {
        pending.set(toolKey(id, event.toolUseId), own)
      }
      const started = event.kind === "tool-end" ? (pending.get(toolKey(id, event.toolUseId)) ?? []) : []
      if (event.kind === "tool-end") {
        pending.delete(toolKey(id, event.toolUseId))
      }
      const k = of(id)
      const fresh = resolveAll([...started, ...own], cwd).filter((file) => changed(k.items.get(file.path), file))
      const items = fresh.map((file): MediaItem => ({ ...file, entry }))
      items.forEach((item) => k.items.set(item.path, item))
      return items
    },

    // Mentioned media that still exists, newest mention first
    list: (id: SessionId): ReadonlyArray<MediaItem> => {
      const cwd = deps.cwd(id)
      if (!cwd) {
        return []
      }
      const k = scan(id, cwd)
      const current = [...k.items.values()].flatMap((item) => {
        const file = mediaFile(item.path, cwd, home)
        return file ? [{ ...file, entry: item.entry }] : []
      })
      k.items.clear()
      current.forEach((item) => k.items.set(item.path, item))
      return current.sort((a, b) => (b.entry ?? 0) - (a.entry ?? 0))
    },

    // Servable file: mentioned by the session or inside its cwd
    resolve: (id: SessionId, raw: string): MediaItem | null => {
      const cwd = deps.cwd(id)
      const file = cwd && path.isAbsolute(raw) ? mediaFile(raw, cwd, home) : null
      if (!cwd || !file) {
        return null
      }
      const mentioned = of(id).items.get(file.path) ?? scan(id, cwd).items.get(file.path)
      if (mentioned) {
        return { ...file, entry: mentioned.entry }
      }
      return isInside(file.path, cwd) ? { ...file, entry: null } : null
    },

    forget: (id: SessionId) => {
      known.delete(id)
      ;[...pending.keys()].filter((key) => key.startsWith(`${id} `)).forEach((key) => pending.delete(key))
    },
  }
}

export type MediaIndex = ReturnType<typeof makeMediaIndex>
