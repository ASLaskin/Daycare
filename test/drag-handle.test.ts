import { beforeEach, describe, expect, test } from "bun:test"
import { DRAG_SHIELD, type DragEnv, type DragHandle, wireDrag } from "../src/renderer/drag-handle.ts"

class Classes {
  readonly set = new Set<string>()
  add = (...tokens: string[]) => tokens.forEach((t) => this.set.add(t))
  remove = (...tokens: string[]) => tokens.forEach((t) => this.set.delete(t))
}

class FakeHandle extends EventTarget implements DragHandle {
  readonly classList = new Classes()
  readonly captured = new Set<number>()
  failCapture = false
  setPointerCapture(id: number) {
    if (this.failCapture) {
      throw new Error("InvalidPointerId")
    }
    this.captured.add(id)
  }
  hasPointerCapture(id: number) {
    return this.captured.has(id)
  }
  releasePointerCapture(id: number) {
    this.captured.delete(id)
    this.dispatchEvent(new Event("lostpointercapture"))
  }
}

const pointer = (type: string, fields: { button?: number; buttons?: number; clientX?: number } = {}) =>
  Object.assign(new Event(type, { cancelable: true }), { button: 0, buttons: 1, pointerId: 1, clientX: 0, clientY: 0, ...fields })

let handle: FakeHandle
let body: Classes
let win: EventTarget
let moves: number[]
let ends: number

beforeEach(() => {
  handle = new FakeHandle()
  body = new Classes()
  win = new EventTarget()
  moves = []
  ends = 0
  const env: DragEnv = { body: { classList: body }, win }
  wireDrag<{ x: number }>(
    handle,
    {
      start: () => ({ x: 0 }),
      bodyClass: () => "resizing",
      move: (s, e) => {
        s.x = e.clientX
        moves.push(e.clientX)
      },
      end: () => {
        ends++
      },
    },
    env,
  )
})

const isClean = () => {
  expect(body.set.size).toBe(0)
  expect(handle.classList.set.has("dragging")).toBe(false)
  expect(handle.captured.size).toBe(0)
}

const press = () => {
  handle.dispatchEvent(pointer("pointerdown"))
  expect(body.set.has("resizing")).toBe(true)
  expect(body.set.has(DRAG_SHIELD)).toBe(true)
  expect(handle.captured.has(1)).toBe(true)
}

describe("wireDrag", () => {
  test("pointerup ends the drag once and cleans up", () => {
    press()
    handle.dispatchEvent(pointer("pointermove", { clientX: 40 }))
    handle.dispatchEvent(pointer("pointerup"))
    expect(moves).toEqual([40])
    expect(ends).toBe(1)
    isClean()
  })

  test("release seen only by the window ends the drag", () => {
    press()
    win.dispatchEvent(pointer("pointerup"))
    expect(ends).toBe(1)
    isClean()
  })

  test("move with no buttons held ends the drag", () => {
    press()
    handle.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 90 }))
    expect(moves).toEqual([])
    expect(ends).toBe(1)
    isClean()
  })

  test.each(["blur", "pointercancel"])("window %s ends the drag", (type) => {
    press()
    win.dispatchEvent(new Event(type))
    expect(ends).toBe(1)
    isClean()
  })

  test("lost capture ends the drag", () => {
    press()
    handle.captured.clear()
    handle.dispatchEvent(new Event("lostpointercapture"))
    expect(ends).toBe(1)
    isClean()
  })

  test("Escape ends the drag, other keys do not", () => {
    press()
    win.dispatchEvent(Object.assign(new Event("keydown"), { key: "a" }))
    expect(ends).toBe(0)
    win.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }))
    expect(ends).toBe(1)
    isClean()
  })

  test("window listeners are removed after the drag ends", () => {
    press()
    handle.dispatchEvent(pointer("pointerup"))
    win.dispatchEvent(new Event("blur"))
    win.dispatchEvent(pointer("pointerup"))
    expect(ends).toBe(1)
  })

  test("failed capture still ends on window release", () => {
    handle.failCapture = true
    handle.dispatchEvent(pointer("pointerdown"))
    expect(body.set.has(DRAG_SHIELD)).toBe(true)
    win.dispatchEvent(pointer("pointerup"))
    expect(ends).toBe(1)
    isClean()
  })

  test("non primary button never starts a drag", () => {
    handle.dispatchEvent(pointer("pointerdown", { button: 2 }))
    handle.dispatchEvent(pointer("pointermove", { clientX: 10 }))
    expect(moves).toEqual([])
    expect(ends).toBe(0)
    isClean()
  })
})
