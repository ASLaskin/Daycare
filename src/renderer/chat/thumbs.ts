// Image thumbnails that open full size on click.

import { type ChatImage, imageDataUrl } from "../../shared/images.ts"
import { el } from "../dom.ts"
import { button } from "./controls.ts"
import { openLightbox } from "./lightbox.ts"

export const thumb = (image: ChatImage, label: string) => {
  const src = imageDataUrl(image)
  const b = button("chat-thumb")
  b.title = label
  b.setAttribute("aria-label", label)
  const img = el("img")
  img.src = src
  img.alt = ""
  b.append(img)
  b.addEventListener("click", (e) => {
    e.stopPropagation()
    openLightbox(src, label)
  })
  return b
}

// Row of thumbnails for a sent message
export const sentThumbs = (images: ReadonlyArray<ChatImage>) => {
  const row = el("div", "chat-thumbs")
  row.append(...images.map((image, i) => thumb(image, `Image ${i + 1}`)))
  return row
}
