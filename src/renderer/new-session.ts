// Location pickers, kind buttons, and starting sessions.

import type { SessionKind } from "../shared/session.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { closeSettings } from "./settings-view.ts"
import { openSheet } from "./sheet.ts"
import { settings } from "./store.ts"

let currentLoc = 0

export const setCurrentLocation = (i: number) => {
  currentLoc = i
}

// Keeps the picked location valid after edits.
export const clampLocation = () => {
  const s = settings()
  if (currentLoc >= s.locations.length) {
    currentLoc = Math.min(s.defaultLocation, s.locations.length - 1)
  }
}

export const defaultKind = (): SessionKind => settings().sessionKind
export const otherKind = (): SessionKind => (defaultKind() === "chat" ? "terminal" : "chat")

export const locationOptions = (select: HTMLSelectElement, selected: number) => {
  select.replaceChildren(
    ...settings().locations.map((l, i) => {
      const o = el("option", null, `${i + 1}   ${l.label}`)
      o.value = String(i)
      o.title = l.path
      return o
    }),
  )
  select.value = String(selected)
}

export const renderLocationPickers = () => {
  locationOptions($<HTMLSelectElement>("#location"), currentLoc)
  $("#empty-locations").replaceChildren(
    ...settings().locations.map((l, i) => {
      const b = el("button", "loc-button")
      b.append(el("span", null, l.label), el("span", "kbd", i < 9 ? `⌘${i + 1}` : ""))
      b.title = l.path
      b.onclick = () => newSession(i)
      return b
    }),
  )
}

export const renderKindButtons = () => {
  $("#new-master").textContent = `New ${defaultKind()}`
  const alt = $("#new-master-alt")
  alt.textContent = `New ${otherKind()}`
  alt.title = `Open a ${otherKind()} session instead (⇧⌘N)`
}

export const newSession = (locIndex = currentLoc, kind = defaultKind()) => {
  const s = settings()
  const loc = s.locations[locIndex]
  if (!loc) {
    return
  }
  currentLoc = locIndex
  $<HTMLSelectElement>("#location").value = String(locIndex)
  closeSettings()
  if (s.askOnNew) {
    openSheet(locIndex, kind)
    return
  }
  api.createMaster({ task: "", kind, cwd: loc.path, model: s.model, permissionMode: s.permissionMode })
}

export const initNewSession = () => {
  $<HTMLSelectElement>("#location").onchange = (e) => {
    currentLoc = Number((e.target as HTMLSelectElement).value)
  }
  $("#new-master").onclick = () => newSession()
  $("#new-master-alt").onclick = () => newSession(currentLoc, otherKind())
}
