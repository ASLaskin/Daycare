// Paste, drag and drop, and picker input for images.

import { addFiles } from "./attachments.ts"
import type { ChatSession } from "./types.ts"

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false

export const wireAttachInput = (s: ChatSession) => {
  s.attach.addEventListener("click", () => s.picker.click())
  s.picker.addEventListener("change", () => {
    const files = [...(s.picker.files ?? [])]
    s.picker.value = ""
    void addFiles(s, files).then(() => s.input.focus())
  })
  s.input.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])]
    if (!files.length) {
      return
    }
    e.preventDefault()
    void addFiles(s, files)
  })
  // Depth of nested drag enter events
  let depth = 0
  const setDropping = (on: boolean) => s.root.classList.toggle("dropping", on && !s.ended)
  s.root.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) {
      return
    }
    depth += 1
    setDropping(true)
  })
  s.root.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) {
      return
    }
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = s.ended ? "none" : "copy"
    }
  })
  s.root.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) {
      return
    }
    depth = Math.max(0, depth - 1)
    setDropping(depth > 0)
  })
  s.root.addEventListener("drop", (e) => {
    if (!hasFiles(e)) {
      return
    }
    e.preventDefault()
    depth = 0
    setDropping(false)
    void addFiles(s, [...(e.dataTransfer?.files ?? [])]).then(() => s.input.focus())
  })
}
