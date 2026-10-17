// Images waiting in the composer.

import { asBase64, type ChatImage, detectImageType, UNSUPPORTED_MESSAGE } from "../../shared/images.ts"
import { el } from "../dom.ts"
import { toast } from "../toast.ts"
import { attachProblem } from "./attach-rules.ts"
import { button } from "./controls.ts"
import { thumb } from "./thumbs.ts"
import type { ChatSession } from "./types.ts"

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// Image from a file, or the reason it was rejected
const readImage = async (file: File, attached: number): Promise<ChatImage | string> => {
  const mediaType = detectImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  const problem = attachProblem({ attached, bytes: file.size, mediaType })
  if (problem || !mediaType) {
    return problem ?? UNSUPPORTED_MESSAGE
  }
  return { mediaType, data: asBase64(await readBase64(file)) }
}

export const renderAttachments = (s: ChatSession) => {
  s.thumbs.hidden = !s.attachments.length
  s.thumbs.replaceChildren(
    ...s.attachments.map((image, i) => {
      const item = el("div", "chat-thumb-item")
      const remove = button("chat-thumb-remove", "×")
      remove.title = "Remove image"
      remove.setAttribute("aria-label", `Remove image ${i + 1}`)
      remove.addEventListener("click", () => {
        s.attachments.splice(i, 1)
        renderAttachments(s)
        s.input.dispatchEvent(new Event("input"))
        s.input.focus()
      })
      item.append(thumb(image, `Image ${i + 1}`), remove)
      return item
    }),
  )
}

// Adds files in order, toasting each distinct rejection
export const addFiles = async (s: ChatSession, files: ReadonlyArray<File>) => {
  if (s.ended || !files.length) {
    return
  }
  const problems = new Set<string>()
  await files.reduce(async (prev, file) => {
    await prev
    const result = await readImage(file, s.attachments.length).catch(() => "Could not read that file.")
    if (typeof result === "string") {
      problems.add(result)
      return
    }
    s.attachments.push(result)
  }, Promise.resolve())
  problems.forEach(toast)
  renderAttachments(s)
  s.input.dispatchEvent(new Event("input"))
}

// Empties the composer images, returning them
export const takeAttachments = (s: ChatSession): ReadonlyArray<ChatImage> => {
  const images = s.attachments.splice(0)
  renderAttachments(s)
  return images
}
