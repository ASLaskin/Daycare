// Locks feed webviews to their partition and hosts.

import { type BrowserWindow, session, shell, type WebContents } from "electron"
import { FEED_PARTITION, isFeedUrl } from "../../shared/feed.ts"

// Sites turn away user agents that name Electron
const browserUserAgent = (ua: string) => ua.replace(/\s(Electron|Daycare|daycare)\/\S+/g, "")

const openOutside = (url: string) => {
  if (URL.parse(url)?.protocol === "https:") {
    void shell.openExternal(url)
  }
}

// Off host links open in the browser
const guardGuest = (guest: WebContents) => {
  const follow = (url: string) => {
    if (isFeedUrl(url)) {
      void guest.loadURL(url)
      return
    }
    openOutside(url)
  }
  guest.setWindowOpenHandler(({ url }) => {
    follow(url)
    return { action: "deny" }
  })
  guest.on("will-navigate", (event, url) => {
    if (isFeedUrl(url)) {
      return
    }
    event.preventDefault()
    openOutside(url)
  })
}

export const guardFeedWebviews = (win: BrowserWindow) => {
  const feed = session.fromPartition(FEED_PARTITION)
  feed.setUserAgent(browserUserAgent(feed.getUserAgent()))
  feed.setPermissionRequestHandler((_wc, permission, done) => done(permission === "fullscreen"))
  win.webContents.on("will-attach-webview", (event, prefs, params) => {
    if (params["partition"] !== FEED_PARTITION || !isFeedUrl(params["src"] ?? "")) {
      event.preventDefault()
      return
    }
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
  })
  win.webContents.on("did-attach-webview", (_event, guest) => guardGuest(guest))
}
