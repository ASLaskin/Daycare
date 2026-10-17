// Full size image overlay.

import { el } from "../dom.ts"

export const openLightbox = (src: string, alt: string) => {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const overlay = el("div", "chat-lightbox")
  overlay.tabIndex = -1
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-label", alt)
  const img = el("img", "chat-lightbox-img")
  img.src = src
  img.alt = alt
  overlay.append(img)
  const close = () => {
    overlay.remove()
    back?.focus()
  }
  overlay.addEventListener("click", close)
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  })
  document.body.append(overlay)
  overlay.focus()
}
