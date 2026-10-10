// Location pickers and starting sessions.

import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { relocateMaster } from "./session-actions.ts"
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

export const newSession = (locIndex = currentLoc) => {
  const s = settings()
  const loc = s.locations[locIndex]
  if (!loc) {
    return
  }
  currentLoc = locIndex
  $<HTMLSelectElement>("#location").value = String(locIndex)
  closeSettings()
  if (s.askOnNew) {
    openSheet(locIndex)
    return
  }
  api.createMaster({ task: "", cwd: loc.path, model: s.model, permissionMode: s.permissionMode, provider: s.provider })
}

// Moves an untouched active master to the picked location.
const relocateActive = () => {
  const id = getActiveMaster()
  const loc = settings().locations[currentLoc]
  if (id && loc) {
    relocateMaster(id, loc.path)
  }
}

export const initNewSession = () => {
  $<HTMLSelectElement>("#location").onchange = (e) => {
    currentLoc = Number((e.target as HTMLSelectElement).value)
    relocateActive()
  }
  $("#new-master").onclick = () => newSession()
}
