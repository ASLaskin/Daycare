// Settings cache and the two cross view events.

import type { Settings } from "../shared/settings.ts"
import { api } from "./api.ts"

type Listener = () => void

const emitter = () => {
  const listeners: Array<Listener> = []
  return {
    on: (fn: Listener) => void listeners.push(fn),
    fire: () => {
      for (const fn of listeners) {
        try {
          fn()
        } catch (err) {
          console.error(err)
        }
      }
    },
  }
}

const settingsChanged = emitter()
const focusChanged = emitter()

let current: Settings | null = null

// Loaded once in main.ts before any view mounts.
export const settings = (): Settings => {
  if (!current) throw new Error("Settings not loaded")
  return current
}

export const loadSettings = async () => {
  current = await api.getSettings()
  settingsChanged.fire()
  return current
}

export const saveSettings = async (patch: Partial<Settings>) => {
  current = await api.setSettings(patch)
  settingsChanged.fire()
  return current
}

export const onSettingsChanged = settingsChanged.on
export const onFocusChanged = focusChanged.on
export const fireFocusChanged = focusChanged.fire
