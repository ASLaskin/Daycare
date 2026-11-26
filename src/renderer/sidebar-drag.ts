// Dragging sidebar sessions onto drop zones.

import type { SessionId } from "../shared/ids.ts"
import { isRenaming } from "./rename.ts"

let dragged: SessionId | null = null
let target: HTMLElement | null = null

const setTarget = (node: HTMLElement | null) => {
  if (target === node) {
    return
  }
  target?.classList.remove("drop-target")
  node?.classList.add("drop-target")
  target = node
}

export const makeDraggable = (node: HTMLElement, id: () => SessionId) => {
  node.draggable = true
  node.addEventListener("dragstart", (e) => {
    e.stopPropagation()
    if (isRenaming()) {
      e.preventDefault()
      return
    }
    dragged = id()
    e.dataTransfer?.setData("text/plain", dragged)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
    }
    node.classList.add("dragging")
    document.body.classList.add("dragging-session")
  })
  node.addEventListener("dragend", () => {
    dragged = null
    setTarget(null)
    node.classList.remove("dragging")
    document.body.classList.remove("dragging-session")
  })
}

// Innermost accepting zone wins and highlights
export const dropZone = (node: HTMLElement, accepts: (id: SessionId) => boolean, onDrop: (id: SessionId) => void) => {
  node.addEventListener("dragover", (e) => {
    if (!dragged || !accepts(dragged)) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setTarget(node)
  })
  node.addEventListener("dragleave", (e) => {
    if (target === node && !node.contains(e.relatedTarget as Node | null)) {
      setTarget(null)
    }
  })
  node.addEventListener("drop", (e) => {
    if (!dragged || !accepts(dragged)) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const id = dragged
    setTarget(null)
    onDrop(id)
  })
}
