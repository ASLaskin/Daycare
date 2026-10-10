// Caps how many images chat history carries.

import type { ChatEvent } from "../../shared/chat.ts"

export const HISTORY_IMAGES_MAX = 40

// Drops images from older user messages past the limit
export const keepRecentImages = (events: ReadonlyArray<ChatEvent>, max = HISTORY_IMAGES_MAX): Array<ChatEvent> => {
  const { kept } = events.reduceRight<{ kept: Array<ChatEvent>; budget: number }>(
    (acc, ev) => {
      if (ev.kind !== "user" || !ev.images.length) {
        acc.kept.push(ev)
        return acc
      }
      const keep = Math.min(ev.images.length, Math.max(0, acc.budget))
      const dropped = ev.images.length - keep
      acc.kept.push(dropped ? { ...ev, images: ev.images.slice(ev.images.length - keep), omittedImages: ev.omittedImages + dropped } : ev)
      acc.budget -= keep
      return acc
    },
    { kept: [], budget: max },
  )
  return kept.reverse()
}
