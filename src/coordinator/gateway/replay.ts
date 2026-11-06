// Bounded buffer of recent phone events for resume.

import type { MobileEvent } from "../../shared/mobile.ts"

export const MAX_EVENTS = 20_000
export const MAX_BYTES = 16 * 1024 * 1024

// One phone event, its JSON encoded once
export interface Item {
  readonly seq: number
  readonly event: MobileEvent
  readonly json: string
}

export interface ReplayLimits {
  readonly events: number
  readonly bytes: number
}

// floor: hub seq before the first buffered event
export const makeReplay = (floor: number, limits: ReplayLimits = { events: MAX_EVENTS, bytes: MAX_BYTES }) => {
  let items: Array<Item> = []
  let head = 0
  let bytes = 0
  // Highest seq no longer buffered
  let evicted = floor
  let latest = floor

  const evict = () => {
    while (items.length - head > limits.events || (bytes > limits.bytes && items.length - head > 1)) {
      const old = items[head]!
      head += 1
      bytes -= old.json.length
      evicted = Math.max(evicted, old.seq)
    }
    // Compacts once half the array is dead
    if (head > 1024 && head * 2 > items.length) {
      items = items.slice(head)
      head = 0
    }
  }

  return {
    push: (seq: number, event: MobileEvent): Item => {
      const item = { seq, event, json: JSON.stringify(event) }
      items.push(item)
      bytes += item.json.length
      latest = Math.max(latest, seq)
      evict()
      return item
    },

    // Hub seq moved without a phone event
    advance: (seq: number) => {
      latest = Math.max(latest, seq)
    },

    // Items after seq, or null when some were evicted or never seen
    since: (seq: number): ReadonlyArray<Item> | null => {
      if (seq < evicted || seq > latest) {
        return null
      }
      return items.slice(head).filter((i) => i.seq > seq)
    },

    size: () => items.length - head,
  }
}

export type Replay = ReturnType<typeof makeReplay>
