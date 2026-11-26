// Hides site chrome so each feed page shows only the reel column.

import type { FeedTab } from "../../shared/settings.ts"

// Tree fields the box search reads
export interface ChromeNode<N> {
  readonly parentElement: N | null
  contains(other: N): boolean
}

// Outermost ancestor of anchor holding no protected node, or null
export const boxToHide = <N extends ChromeNode<N>>(anchor: N, root: N, isProtected: (n: N) => boolean): N | null => {
  if (anchor === root || isProtected(anchor) || !root.contains(anchor)) {
    return null
  }
  let box = anchor
  while (box.parentElement && box.parentElement !== root && !isProtected(box.parentElement)) {
    box = box.parentElement
  }
  return box
}

// Guest side: marks chrome boxes hidden, never one holding the video or feed
const hideChrome = (find: typeof boxToHide, anchors: ReadonlyArray<string>) => {
  const w = window as Window & { __daycareChrome?: boolean }
  if (w.__daycareChrome) {
    return
  }
  w.__daycareChrome = true
  const HIDE = "data-daycare-hide"
  const style = document.createElement("style")
  style.textContent = `[${HIDE}] { display: none !important; }`
  document.documentElement.append(style)

  const isProtected = (n: Element) => n.matches("video, [data-daycare-pager]") || n.querySelector("video, [data-daycare-pager]") !== null

  // Players size themselves on resize, so refit once the first one shows
  let fitted = false
  const refit = () => {
    fitted = true
    ;[0, 1000].forEach((ms) => setTimeout(() => dispatchEvent(new Event("resize")), ms))
  }

  const sweep = () => {
    if (!document.querySelector("video")) {
      return
    }
    if (!fitted) {
      refit()
    }
    anchors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((anchor) => find(anchor, document.body, isProtected))
      .filter((box): box is Element => box !== null && !box.hasAttribute(HIDE))
      .forEach((box) => box.setAttribute(HIDE, ""))
  }

  let queued = false
  const queue = () => {
    if (queued) {
      return
    }
    queued = true
    setTimeout(() => {
      queued = false
      sweep()
    }, 250)
  }
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true })
  sweep()
}

// Nodes inside each site's chrome; their outermost video free box is hidden
const ANCHORS: Readonly<Record<FeedTab, ReadonlyArray<string>>> = {
  reels: [
    'header svg[aria-label="Instagram"]',
    'svg[aria-label="Home"]',
    'nav[role="navigation"]',
    '[role="dialog"] a[href*="/accounts/"]',
    '[role="dialog"] a[href^="intent:"]',
  ],
  shorts: [],
}

// Stylesheets per site, keyed on stable ids and tags
const CSS: Readonly<Record<FeedTab, string>> = {
  reels: `
    html, body { scrollbar-width: none !important; }
    [data-daycare-pager] { top: 0 !important; height: 100vh !important; }
  `,
  shorts: `
    html, body { scrollbar-width: none !important; }
    #masthead-container, tp-yt-app-drawer#guide, ytd-mini-guide-renderer, #shorts-panel-container,
    ytd-shorts #navigation-container, #cinematic-shorts-scrim { display: none !important; }
    ytd-app { --ytd-masthead-height: 0px !important; --ytd-shorts-masthead-height: 0px !important; --ytd-masthead-height-accounting-for-hidden: 0px !important; }
    ytd-page-manager { margin: 0 !important; }
    ytd-shorts, #shorts-container, #shorts-inner-container { height: 100vh !important; padding: 0 !important; margin: 0 !important; }
    ytd-shorts * {
      --ytd-shorts-player-height: 100vh !important;
      --ytd-shorts-player-width: min(100vh * var(--ytd-shorts-player-ratio, 0.5625), 100vw - 64px) !important;
    }
    #shorts-inner-container > * { min-height: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; }
    ytd-reel-video-renderer, ytd-shorts ytd-player { min-height: 0 !important; }
  `,
}

export const chromeCss = (tab: FeedTab) => CSS[tab]

export const chromeScript = (tab: FeedTab) => `(${hideChrome.toString()})(${boxToHide.toString()}, ${JSON.stringify(ANCHORS[tab])})`
