// Keep awake mode, busy count, battery and lid as PowerState.

import type { Battery, LidClosed, PowerState } from "../../shared/power.ts"
import { DEFAULT_KEEP_AWAKE, type KeepAwake } from "../../shared/settings.ts"
import type { Assertion } from "./assertion.ts"

export interface PowerDeps {
  readonly assertion: Assertion
  // Null when no mode was ever set
  readonly load: () => KeepAwake | null
  readonly save: (mode: KeepAwake) => void
  readonly onChange: (state: PowerState) => void
  // Set when keep awake cannot work here
  readonly unsupported?: string
}

export const wantsAssertion = (mode: KeepAwake, busyCount: number) => mode === "always" || (mode === "while-running" && busyCount > 0)

export const makePower = (deps: PowerDeps) => {
  const { assertion, onChange } = deps
  const saved = deps.load()
  let stored = saved !== null
  let mode = saved ?? DEFAULT_KEEP_AWAKE
  let busyCount = 0
  let battery: Battery | null = null
  let lidClosed: LidClosed | null = null
  let error: string | null = null
  let last = ""

  const wanted = () => wantsAssertion(mode, busyCount)

  const state = (): PowerState => ({
    mode,
    holding: assertion.held(),
    busyCount,
    battery,
    lidClosed,
    error: error ?? (wanted() && deps.unsupported ? deps.unsupported : null),
  })

  // Reports only real changes
  const publish = () => {
    const next = state()
    const key = JSON.stringify(next)
    if (key !== last) {
      last = key
      onChange(next)
    }
  }

  const lost = (reason: string) => {
    error = reason
    publish()
  }

  const sync = () => {
    if (wanted()) {
      assertion.hold(lost)
    } else {
      assertion.release()
    }
    publish()
  }

  return {
    state,
    // Initial sets only when no mode is stored
    setMode: (next: KeepAwake, initial = false) => {
      if (initial && stored) {
        return
      }
      stored = true
      mode = next
      error = null
      deps.save(next)
      sync()
    },
    setBusy: (count: number) => {
      if (count !== busyCount) {
        busyCount = count
        sync()
      }
    },
    // A new reading time alone is not a change
    setBattery: (reading: Battery | null) => {
      const same = JSON.stringify({ ...battery, readAt: 0 }) === JSON.stringify({ ...reading, readAt: 0 })
      battery = reading
      if (!same) {
        publish()
      }
    },
    setLid: (lid: LidClosed | null) => {
      lidClosed = lid
      publish()
    },
    stop: () => assertion.release(),
  }
}

export type Power = ReturnType<typeof makePower>
