import type { Attachment } from "../../shared/attachments.ts"

export interface Seen {
  readonly attachment: Attachment
  readonly seq: number
}

export interface ChatAttachments {
  readonly name: string
  readonly seen: ReadonlyArray<Seen>
}

export interface SessionAttachment {
  readonly attachment: Attachment
  readonly chats: ReadonlyArray<string>
  readonly seq: number
}

// One entry per attachment across chats, oldest first
export const aggregate = (chats: ReadonlyArray<ChatAttachments>): ReadonlyArray<SessionAttachment> => {
  const byKey = chats
    .flatMap((c) => c.seen.map((s) => ({ ...s, name: c.name })))
    .reduce((acc, s) => {
      const prev = acc.get(s.attachment.key)
      const chats = prev?.chats ?? []
      acc.set(s.attachment.key, {
        attachment: prev?.attachment ?? s.attachment,
        chats: chats.includes(s.name) ? chats : [...chats, s.name],
        seq: Math.max(prev?.seq ?? 0, s.seq),
      })
      return acc
    }, new Map<string, SessionAttachment>())
  return [...byKey.values()].sort((a, b) => a.seq - b.seq)
}
