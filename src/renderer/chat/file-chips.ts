// File name chips for non-image attachments.

import { fileName } from "../../shared/files.ts"
import type { FilePath } from "../../shared/ids.ts"
import { openPath } from "../attachments/open.ts"
import { el } from "../dom.ts"
import { button } from "./controls.ts"

// Draft chip with a remove button
export const draftChip = (path: FilePath, onRemove: () => void) => {
  const name = fileName(path)
  const chip = el("div", "chat-file")
  chip.title = path
  const remove = button("chat-file-remove", "×")
  remove.title = "Remove file"
  remove.setAttribute("aria-label", `Remove ${name}`)
  remove.addEventListener("click", onRemove)
  chip.append(el("span", "chat-file-name", name), remove)
  return chip
}

// Row of chips for a sent message, each opening its file
export const sentFiles = (paths: ReadonlyArray<FilePath>) => {
  const row = el("div", "chat-files")
  row.append(
    ...paths.map((path) => {
      const chip = button("chat-file chat-file-sent")
      chip.title = path
      chip.append(el("span", "chat-file-name", fileName(path)))
      chip.addEventListener("click", (e) => {
        e.stopPropagation()
        void openPath(path)
      })
      return chip
    }),
  )
  return row
}
