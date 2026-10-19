// Moving focus between sessions and their agents.

import type { SessionId } from "../shared/ids.ts"
import { membersOf } from "./collapse.ts"
import { focused, focusSession, getActiveMaster } from "./focus.ts"
import { openMasters } from "./state.ts"
import { isZoomed, toggleZoom } from "./zoom.ts"

// Zoom follows focus to the next pane
const go = (id: SessionId) => {
  if (isZoomed()) {
    toggleZoom(id)
    return
  }
  focusSession(id)
}

// Wraps around; starts at an end when nothing is current
const step = <T extends { readonly id: SessionId }>(list: ReadonlyArray<T>, current: SessionId | null, by: number) => {
  const at = list.findIndex((x) => x.id === current)
  if (at < 0) {
    return (by > 0 ? list[0] : list[list.length - 1]) ?? null
  }
  return list[(at + by + list.length) % list.length] ?? null
}

const agents = () => {
  const master = getActiveMaster()
  return master ? membersOf(master) : []
}

// 1 is the master, then workers in order
export const focusAgent = (n: number) => {
  const target = agents()[n - 1]
  if (target) {
    go(target.id)
  }
}

export const cycleAgent = (by: number) => {
  const target = step(agents(), focused()?.id ?? null, by)
  if (target) {
    go(target.id)
  }
}

export const cycleSession = (by: number) => {
  const target = step(openMasters(), getActiveMaster(), by)
  if (target) {
    focusSession(target.id)
  }
}
