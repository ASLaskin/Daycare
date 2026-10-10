import { type Attachment, mentionsOf, pathAttachment, urlAttachment } from "../../shared/attachments.ts"
import type { ChatEvent } from "../../shared/chat.ts"
import type { DirPath, SessionId, ToolUseId } from "../../shared/ids.ts"
import type { Seen } from "./aggregate.ts"
import { resolvePaths } from "./resolve.ts"

interface Found {
  readonly items: Map<string, Seen>
  readonly writes: Map<ToolUseId, string>
}

const bySession = new Map<SessionId, Found>()
const listeners = new Set<() => void>()
let seq = 0

export const onAttachmentsChanged = (fn: () => void) => void listeners.add(fn)

export const seenIn = (id: SessionId): ReadonlyArray<Seen> => [...(bySession.get(id)?.items.values() ?? [])]

const foundFor = (id: SessionId): Found => {
  const hit = bySession.get(id)
  if (hit) {
    return hit
  }
  const fresh: Found = { items: new Map(), writes: new Map() }
  bySession.set(id, fresh)
  return fresh
}

const add = (id: SessionId, found: Found, items: ReadonlyArray<Attachment>) => {
  const fresh = items.filter((a) => !found.items.has(a.key))
  if (!fresh.length || bySession.get(id) !== found) {
    return
  }
  fresh.forEach((a) => found.items.set(a.key, { attachment: a, seq: ++seq }))
  listeners.forEach((fn) => fn())
}

const addPaths = (id: SessionId, found: Found, cwd: DirPath, paths: ReadonlyArray<string>) => {
  if (!paths.length) {
    return
  }
  void resolvePaths(cwd, paths).then((resolved) => add(id, found, resolved.map(pathAttachment)))
}

// Record files, folders and urls an event mentions
export const collectAttachments = (id: SessionId, ev: ChatEvent, cwd: DirPath) => {
  const found = foundFor(id)
  if (ev.kind === "tool-end") {
    const written = found.writes.get(ev.toolUseId)
    found.writes.delete(ev.toolUseId)
    addPaths(id, found, cwd, written && !ev.isError ? [written] : [])
    return
  }
  const m = mentionsOf(ev)
  if (m.written) {
    found.writes.set(m.written.toolUseId, m.written.path)
  }
  add(id, found, m.urls.map(urlAttachment))
  addPaths(id, found, cwd, m.paths)
}

export const forgetAttachments = (id: SessionId) => {
  bySession.delete(id)
  listeners.forEach((fn) => fn())
}
