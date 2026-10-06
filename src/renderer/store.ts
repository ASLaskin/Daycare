// Settings cache and cross view events.

import type { Settings } from "../shared/settings.ts"
import { api } from "./api.ts"

type Listener = () => void

const emitter = () => {
  const listeners: Array<Listener> = []
  const call = (fn: Listener) => {
    try {
      fn()
    } catch (err) {
      console.error(err)
    }
  }
  return {
    on: (fn: Listener) => void listeners.push(fn),
    fire: () => listeners.forEach(call),
  }
}

const settingsChanged = emitter()
const focusChanged = emitter()

let current: Settings | null = null

// Loaded settings; throws before main.ts loads them.
export const settings = (): Settings => {
  if (!current) {
    throw new Error("Settings not loaded")
  }
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
