// Small drawing editor that attaches its PNG like an uploaded image.

import { el } from "../dom.ts"
import { toast } from "../toast.ts"
import { addFiles } from "./attachments.ts"
import { button } from "./controls.ts"
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToPng,
  clearCanvas,
  drawText,
  type PaintTool,
  pointAt,
  strokeSegment,
} from "./paint-canvas.ts"
import type { ChatSession } from "./types.ts"

const TOOLS: ReadonlyArray<{ readonly id: PaintTool; readonly label: string }> = [
  { id: "pen", label: "Pen" },
  { id: "eraser", label: "Eraser" },
  { id: "text", label: "Text" },
]

export const openPaint = (s: ChatSession) => {
  const overlay = el("div", "paint")
  const card = el("div", "paint-card")
  const canvas = el("canvas", "paint-canvas")
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  clearCanvas(canvas)
  const stage = el("div", "paint-stage")
  stage.append(canvas)

  let tool: PaintTool = "pen"
  const toolButtons = TOOLS.map((t) => {
    const b = button("paint-tool", t.label)
    b.addEventListener("click", () => {
      tool = t.id
      toolButtons.forEach((other, i) => other.classList.toggle("active", TOOLS[i]?.id === tool))
    })
    return b
  })
  toolButtons[0]?.classList.add("active")

  const close = () => {
    document.removeEventListener("keydown", onKey, true)
    overlay.remove()
    s.input.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const clear = button("paint-action", "Clear")
  clear.addEventListener("click", () => clearCanvas(canvas))
  const cancel = button("paint-action", "Cancel")
  cancel.addEventListener("click", close)
  const done = button("paint-action paint-done", "Done")
  done.addEventListener("click", async () => {
    const blob = await canvasToPng(canvas)
    if (!blob) {
      toast("Could not save the drawing.")
      return
    }
    close()
    await addFiles(s, [new File([blob], "drawing.png", { type: "image/png" })])
  })

  const bar = el("div", "paint-bar")
  const tools = el("div", "paint-tools")
  tools.append(...toolButtons)
  const actions = el("div", "paint-actions")
  actions.append(clear, cancel, done)
  bar.append(tools, actions)

  let last: { x: number; y: number } | null = null
  canvas.addEventListener("pointerdown", (e) => {
    const at = pointAt(canvas, e)
    if (tool === "text") {
      e.preventDefault()
      placeText(stage, canvas, at, e)
      return
    }
    canvas.setPointerCapture(e.pointerId)
    last = at
    strokeSegment(canvas, tool, at, at)
  })
  canvas.addEventListener("pointermove", (e) => {
    if (!last || tool === "text") {
      return
    }
    const at = pointAt(canvas, e)
    strokeSegment(canvas, tool, last, at)
    last = at
  })
  const stop = () => {
    last = null
  }
  canvas.addEventListener("pointerup", stop)
  canvas.addEventListener("pointercancel", stop)
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      close()
    }
  })
  document.addEventListener("keydown", onKey, true)

  card.append(bar, stage)
  overlay.append(card)
  document.body.append(overlay)
}

// Floating text box that is drawn onto the canvas on commit
const placeText = (stage: HTMLElement, canvas: HTMLCanvasElement, at: { x: number; y: number }, e: PointerEvent) => {
  stage.querySelector(".paint-text")?.dispatchEvent(new Event("blur"))
  const box = el("textarea", "paint-text")
  box.rows = 1
  box.setAttribute("aria-label", "Text")
  const stageRect = stage.getBoundingClientRect()
  box.style.left = `${e.clientX - stageRect.left}px`
  box.style.top = `${e.clientY - stageRect.top}px`
  let committed = false
  const commit = () => {
    if (committed) {
      return
    }
    committed = true
    if (box.value.trim()) {
      drawText(canvas, box.value, at)
    }
    box.remove()
  }
  box.addEventListener("blur", commit)
  box.addEventListener("keydown", (ev) => {
    ev.stopPropagation()
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault()
      commit()
    }
    if (ev.key === "Escape") {
      ev.preventDefault()
      committed = true
      box.remove()
    }
  })
  stage.append(box)
  box.focus()
}
