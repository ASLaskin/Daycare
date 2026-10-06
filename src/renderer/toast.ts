import { $, el } from "./dom.ts"

export const toast = (text: string) => {
  const t = el("div", "toast", text)
  $("#toasts").append(t)
  setTimeout(() => {
    t.classList.add("out")
    t.addEventListener("animationend", () => t.remove(), { once: true })
    // With motion off the animation never fires.
    setTimeout(() => t.remove(), 400)
  }, 1600)
}
