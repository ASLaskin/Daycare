// Location pickers and starting sessions.

import { pickLocation } from "./add-location.ts"
import { api } from "./api.ts"
import { $, el, tildify } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { digitShortcutText } from "./keymap.ts"
import { isPristine, relocateMaster } from "./session-actions.ts"
import { closeSettings } from "./settings-view.ts"
import { openSheet } from "./sheet.ts"
import { panes } from "./state.ts"
import { settings } from "./store.ts"

const NEW_LOCATION = "new"

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

const toolbarOptions = (select: HTMLSelectElement) => {
  const paths = settings().locations.map((l, i) => {
    const o = el("option", null, tildify(l.path))
    o.value = String(i)
    o.title = l.path
    return o
  })
  const add = el("option", null, "New...")
  add.value = NEW_LOCATION
  select.replaceChildren(...paths, add)
  select.value = String(currentLoc)
}

const locationButton = (label: string, path: string, hint: string, onClick: () => void) => {
  const b = el("button", "loc-button")
  const text = el("span", "loc-text")
  text.append(el("span", null, label), el("span", "loc-path", path))
  b.append(text, el("span", "kbd", hint))
  b.title = path
  b.onclick = onClick
  return b
}

export const renderLocationPickers = () => {
  toolbarOptions($<HTMLSelectElement>("#location"))
  const buttons = settings().locations.map((l, i) =>
    locationButton(l.label, tildify(l.path), i < 9 ? digitShortcutText("newSessionAt", i + 1) : "", () => newSession(i)),
  )
  $("#empty-locations").replaceChildren(...buttons, locationButton("New...", "Choose another folder", "", openNewLocation))
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
  api.createMaster({ task: "", cwd: loc.path, model: s.masterModel, effort: s.masterEffort, permissionMode: s.permissionMode, masterMode: true, provider: s.provider })
}

// Moves an untouched active master there, else opens a new one.
const openAt = (i: number) => {
  const id = getActiveMaster()
  const info = id ? panes.get(id)?.info : undefined
  const loc = settings().locations[i]
  if (!id || !info || !loc || !isPristine(info)) {
    newSession(i)
    return
  }
  currentLoc = i
  relocateMaster(id, loc.path)
}

const openNewLocation = async () => {
  const i = await pickLocation()
  if (i === null) {
    $<HTMLSelectElement>("#location").value = String(currentLoc)
    return
  }
  openAt(i)
}

export const initNewSession = () => {
  $<HTMLSelectElement>("#location").onchange = (e) => {
    const value = (e.target as HTMLSelectElement).value
    if (value === NEW_LOCATION) {
      openNewLocation()
      return
    }
    openAt(Number(value))
  }
  $("#new-master").onclick = () => newSession()
}
