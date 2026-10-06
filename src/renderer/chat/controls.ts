// Native button that shows and hides a panel
export const wireToggle = (btn: HTMLElement, panel: HTMLElement, onOpen?: () => void) => {
  btn.setAttribute("aria-expanded", "false")
  panel.hidden = true
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true"
    btn.setAttribute("aria-expanded", String(open))
    panel.hidden = !open
    if (open && onOpen) {
      onOpen()
    }
  })
}

export const button = (cls: string, text?: string) => {
  const b = document.createElement("button")
  b.className = cls
  b.type = "button"
  if (text !== undefined) {
    b.textContent = text
  }
  return b
}
