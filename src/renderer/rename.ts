import type { SessionId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { renderSidebar } from "./sidebar.ts"

let renaming = false
export const isRenaming = () => renaming

export const beginRename = (target: HTMLElement, id: SessionId, current: string) => {
  renaming = true
  const input = el("input", "rename-input")
  input.value = current
  target.replaceChildren(input)
  input.focus()
  input.select()
  let done = false
  const finish = (save: boolean) => {
    if (done) {
      return
    }
    done = true
    renaming = false
    const next = input.value.trim()
    target.textContent = save && next ? next : current
    if (save && next && next !== current) {
      api.rename(id, next)
      return
    }
    renderSidebar()
  }
  input.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === "Enter") {
      finish(true)
    }
    if (e.key === "Escape") {
      finish(false)
    }
  }
  input.onblur = () => finish(true)
  input.onclick = (e) => e.stopPropagation()
  input.ondblclick = (e) => e.stopPropagation()
}
