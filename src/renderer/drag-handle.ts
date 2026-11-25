// Pointer drag on a handle that always ends, even when the pointer is lost.

// Pointer fields a drag reads
export interface DragPointer {
  readonly button: number
  readonly buttons: number
  readonly pointerId: number
  readonly clientX: number
  readonly clientY: number
  readonly preventDefault: () => void
}

interface ClassTarget {
  readonly classList: { add: (...tokens: string[]) => void; remove: (...tokens: string[]) => void }
}

export interface DragHandle extends EventTarget, ClassTarget {
  setPointerCapture(pointerId: number): void
  hasPointerCapture(pointerId: number): boolean
  releasePointerCapture(pointerId: number): void
}

export interface DragEnv {
  readonly body: ClassTarget
  readonly win: EventTarget
}

export interface DragHooks<S> {
  // Drag state, or null to ignore the press
  readonly start: (e: DragPointer) => S | null
  readonly move: (state: S, e: DragPointer) => void
  readonly end: (state: S) => void
  // Body class setting the cursor while dragging
  readonly bodyClass: (state: S) => string
}

// Body class making webviews and panes ignore the pointer
export const DRAG_SHIELD = "drag-shield"

const isPointer = (e: Event): e is Event & DragPointer => "pointerId" in e && "buttons" in e

const isEscape = (e: Event) => "key" in e && e.key === "Escape"

const browserEnv = (): DragEnv => ({ body: document.body, win: window })

export const wireDrag = <S>(handle: DragHandle, hooks: DragHooks<S>, env: DragEnv = browserEnv()) => {
  let active: { readonly state: S; readonly pointerId: number; readonly bodyClass: string } | null = null

  const finish = () => {
    if (!active) {
      return
    }
    const { state, pointerId, bodyClass } = active
    active = null
    handle.classList.remove("dragging")
    env.body.classList.remove(bodyClass, DRAG_SHIELD)
    env.win.removeEventListener("blur", finish)
    env.win.removeEventListener("pointerup", finish, true)
    env.win.removeEventListener("pointercancel", finish, true)
    env.win.removeEventListener("keydown", onKey, true)
    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId)
    }
    hooks.end(state)
  }

  const onKey = (e: Event) => {
    if (isEscape(e)) {
      finish()
    }
  }

  handle.addEventListener("pointerdown", (e) => {
    finish()
    if (!isPointer(e) || e.button !== 0) {
      return
    }
    const state = hooks.start(e)
    if (state === null) {
      return
    }
    const bodyClass = hooks.bodyClass(state)
    active = { state, pointerId: e.pointerId, bodyClass }
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone; window listeners still end the drag
    }
    handle.classList.add("dragging")
    env.body.classList.add(bodyClass, DRAG_SHIELD)
    env.win.addEventListener("blur", finish)
    env.win.addEventListener("pointerup", finish, true)
    env.win.addEventListener("pointercancel", finish, true)
    env.win.addEventListener("keydown", onKey, true)
    e.preventDefault()
  })

  handle.addEventListener("pointermove", (e) => {
    if (!active || !isPointer(e)) {
      return
    }
    if (e.buttons === 0) {
      finish()
      return
    }
    hooks.move(active.state, e)
  })

  handle.addEventListener("pointerup", finish)
  handle.addEventListener("pointercancel", finish)
  handle.addEventListener("lostpointercapture", finish)
}
