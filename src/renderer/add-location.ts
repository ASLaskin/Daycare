// Picks a folder and saves it as a deduped location.

import type { DirPath } from "../shared/ids.ts"
import { api } from "./api.ts"
import { baseName } from "./dom.ts"
import { saveSettings, settings } from "./store.ts"

const trimSlash = (p: DirPath) => p.replace(/\/+$/, "") || p

// Index of dir in locations, adding it when missing.
export const addLocation = async (dir: DirPath) => {
  const { locations } = settings()
  const existing = locations.findIndex((l) => trimSlash(l.path) === trimSlash(dir))
  if (existing >= 0) {
    return existing
  }
  await saveSettings({ locations: [...locations, { label: baseName(dir), path: dir }] })
  return locations.length
}

// Location index for a newly picked folder, or null when canceled.
export const pickLocation = async () => {
  const dir = await api.pickFolder()
  return dir ? addLocation(dir) : null
}
