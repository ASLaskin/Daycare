// Drawing surface for the paint tool.

export type PaintTool = "pen" | "eraser" | "text"

export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 480

const PEN_WIDTH = 3
const ERASER_WIDTH = 20
const TEXT_SIZE = 24
const FONT = `${TEXT_SIZE}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`

interface Point {
  readonly x: number
  readonly y: number
}

export const clearCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

// Canvas pixel position of a pointer event
export const pointAt = (canvas: HTMLCanvasElement, e: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  }
}

export const strokeSegment = (canvas: HTMLCanvasElement, tool: PaintTool, from: Point, to: Point) => {
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.strokeStyle = tool === "eraser" ? "#ffffff" : "#000000"
  ctx.lineWidth = tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

// Draws text with its top left corner at the point
export const drawText = (canvas: HTMLCanvasElement, text: string, at: Point) => {
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.fillStyle = "#000000"
  ctx.font = FONT
  ctx.textBaseline = "top"
  text.split("\n").forEach((line, i) => ctx.fillText(line, at.x, at.y + i * TEXT_SIZE * 1.25))
}

export const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
