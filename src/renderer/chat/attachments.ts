// Images and files waiting in the composer.

import type { FilePath } from "../../shared/ids.ts"
import { asBase64, type ChatImage, detectImageType, type ImageMediaType } from "../../shared/images.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { toast } from "../toast.ts"
import { attachRoute } from "./attach-rules.ts"
import { button } from "./controls.ts"
import { draftChip } from "./file-chips.ts"
import { thumb } from "./thumbs.ts"
import type { ChatSession } from "./types.ts"

export interface Draft {
  readonly images: ReadonlyArray<ChatImage>
  readonly files: ReadonlyArray<FilePath>
}

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// Image type from the leading bytes, null for folders and other files
const sniffImage = (file: File): Promise<ImageMediaType | null> =>
  file
    .slice(0, 16)
    .arrayBuffer()
    .then((buf) => detectImageType(new Uint8Array(buf)))
    .catch(() => null)

// Disk path of the file, saving path-less ones first
const filePath = async (file: File): Promise<FilePath> =>
  api.pathForFile(file) ?? api.saveFile({ name: file.name, data: asBase64(await readBase64(file)) })

const changed = (s: ChatSession) => {
  renderAttachments(s)
  s.input.dispatchEvent(new Event("input"))
  s.input.focus()
}

const imageItem = (s: ChatSession, image: ChatImage, i: number) => {
  const item = el("div", "chat-thumb-item")
  const remove = button("chat-thumb-remove", "×")
  remove.title = "Remove image"
  remove.setAttribute("aria-label", `Remove image ${i + 1}`)
  remove.addEventListener("click", () => {
    s.attachments.splice(i, 1)
    changed(s)
  })
  item.append(thumb(image, `Image ${i + 1}`), remove)
  return item
}

const fileItem = (s: ChatSession, path: FilePath, i: number) =>
  draftChip(path, () => {
    s.files.splice(i, 1)
    changed(s)
  })

export const renderAttachments = (s: ChatSession) => {
  s.thumbs.hidden = !s.attachments.length && !s.files.length
  s.thumbs.replaceChildren(
    ...s.attachments.map((image, i) => imageItem(s, image, i)),
    ...s.files.map((path, i) => fileItem(s, path, i)),
  )
}

// Adds one file as an image or a path, or returns why it was rejected
const addFile = async (s: ChatSession, file: File): Promise<string | null> => {
  const route = attachRoute({
    images: s.attachments.length,
    files: s.files.length,
    bytes: file.size,
    mediaType: await sniffImage(file),
    hasPath: api.pathForFile(file) !== null,
  })
  switch (route.kind) {
    case "reject":
      return route.message
    case "image":
      s.attachments.push({ mediaType: route.mediaType, data: asBase64(await readBase64(file)) })
      return null
    case "file": {
      const path = await filePath(file)
      if (!s.files.includes(path)) {
        s.files.push(path)
      }
      return null
    }
  }
}

// Adds files in order, toasting each distinct rejection
export const addFiles = async (s: ChatSession, files: ReadonlyArray<File>) => {
  if (s.ended || !files.length) {
    return
  }
  const problems = new Set<string>()
  await files.reduce(async (prev, file) => {
    await prev
    const problem = await addFile(s, file).catch(() => "Could not read that file.")
    if (problem) {
      problems.add(problem)
    }
  }, Promise.resolve())
  problems.forEach(toast)
  renderAttachments(s)
  s.input.dispatchEvent(new Event("input"))
}

// Empties the composer attachments, returning them
export const takeAttachments = (s: ChatSession): Draft => {
  const draft = { images: s.attachments.splice(0), files: s.files.splice(0) }
  renderAttachments(s)
  return draft
}

// Puts unsent attachments back
export const restoreAttachments = (s: ChatSession, draft: Draft) => {
  s.attachments.push(...draft.images)
  s.files.push(...draft.files)
  renderAttachments(s)
}
