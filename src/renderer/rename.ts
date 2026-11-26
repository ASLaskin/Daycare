import type { SessionId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { renderSidebar } from "./sidebar.ts"

let renaming = false
export const isRenaming = () => renaming

// Inline text edit; save gets the trimmed changed value.
export const beginEdit = (target: HTMLElement, current: string, save: (next: string) => void) => {
  renaming = true
  const input = el("input", "rename-input")
  input.value = current
  target.replaceChildren(input)
  input.focus()
  input.select()
  let done = false
  const finish = (keep: boolean) => {
    if (done) {
      return
    }
    done = true
    renaming = false
    const next = input.value.trim()
    target.textContent = keep && next ? next : current
    if (keep && next && next !== current) {
      save(next)
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

export const beginRename = (target: HTMLElement, id: SessionId, current: string) => beginEdit(target, current, (next) => api.rename(id, next))
