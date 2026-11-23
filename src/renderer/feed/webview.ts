// One feed page in a webview that can be held paused and muted.

import type { WebviewTag } from "electron"
import { FEED_PARTITION, type FeedPage } from "../../shared/feed.ts"

// Pauses media that starts while held
const INSTALL = `(() => {
  if (window.__daycareHold) return
  const hold = { on: false, paused: [] }
  window.__daycareHold = hold
  document.addEventListener("play", (e) => { if (hold.on && e.target instanceof HTMLMediaElement) e.target.pause() }, true)
})()`

const HOLD = `(() => {
  const hold = window.__daycareHold
  if (!hold) return
  hold.on = true
  hold.paused = [...document.querySelectorAll("video, audio")].filter((m) => !m.paused)
  hold.paused.forEach((m) => m.pause())
})()`

const RELEASE = `(() => {
  const hold = window.__daycareHold
  if (!hold) return
  hold.on = false
  hold.paused.forEach((m) => m.play().catch(() => {}))
  hold.paused = []
})()`

export interface FeedView {
  readonly node: WebviewTag
  readonly setHeld: (held: boolean) => void
  readonly reload: () => void
}

export const feedView = (page: FeedPage, held: boolean): FeedView => {
  const node = document.createElement("webview") as WebviewTag
  node.className = "feed-view"
  node.setAttribute("partition", FEED_PARTITION)
  node.setAttribute("src", page.url)
  let ready = false
  let current = held

  const run = (code: string) => {
    if (ready) {
      node.executeJavaScript(code).catch(() => {})
    }
  }

  const apply = () => {
    if (!ready) {
      return
    }
    node.setAudioMuted(current)
    run(current ? HOLD : RELEASE)
  }

  // Each page load needs the hook again
  node.addEventListener("dom-ready", () => {
    ready = true
    run(INSTALL)
    apply()
  })

  const setHeld = (next: boolean) => {
    if (next === current) {
      return
    }
    current = next
    if (next) {
      node.blur()
    }
    apply()
  }

  const reload = () => {
    if (ready) {
      node.reload()
    }
  }

  return { node, setHeld, reload }
}
