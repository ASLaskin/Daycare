// Settings list of new session locations.

import type { Location } from "../shared/settings.ts"
import { api } from "./api.ts"
import { $, baseName, el, tildify } from "./dom.ts"
import { saveSettings, settings } from "./store.ts"

const updateLocation = (i: number, patch: Partial<Location>) =>
  saveSettings({ locations: settings().locations.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

// Default index shifted to stay on the same location.
const shiftedDefault = (def: number, removed: number) => {
  if (def === removed) {
    return 0
  }
  return def > removed ? def - 1 : def
}

const removeLocation = (i: number) => {
  const s = settings()
  saveSettings({ locations: s.locations.filter((_, j) => j !== i), defaultLocation: shiftedDefault(s.defaultLocation, i) })
}

const locationRow = (l: Location, i: number, count: number) => {
  const row = el("div", "location-row")
  const label = el("input")
  label.value = l.label
  label.onchange = () => updateLocation(i, { label: label.value.trim() || baseName(l.path) })
  const pathEl = el("span", "path", tildify(l.path))
  pathEl.title = l.path
  const choose = el("button", "ghost", "Change")
  choose.onclick = async () => {
    const dir = await api.pickFolder()
    if (dir) {
      updateLocation(i, { path: dir })
    }
  }
  const remove = el("button", "ghost", "Remove")
  remove.disabled = count === 1
  remove.onclick = () => removeLocation(i)
  row.append(el("span", "num", i < 9 ? `⌘${i + 1}` : String(i + 1)), label, pathEl, choose, remove)
  return row
}

export const renderLocationRows = () => {
  const { locations } = settings()
  $("#location-rows").replaceChildren(...locations.map((l, i) => locationRow(l, i, locations.length)))
}

export const wireLocations = () => {
  $("#add-location").onclick = async () => {
    const dir = await api.pickFolder()
    if (dir) {
      saveSettings({ locations: [...settings().locations, { label: baseName(dir), path: dir }] })
    }
  }
}
