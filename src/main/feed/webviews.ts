// Locks feed webviews to their partition and hosts.

import { type BrowserWindow, session, shell, type WebContents } from "electron"
import { FEED_PARTITION, isFeedUrl } from "../../shared/feed.ts"
import { isGoogleSignInUrl, trustGoogleSignIn } from "./googleSignIn.ts"

// Sites turn away user agents that name Electron
const browserUserAgent = (ua: string) => ua.replace(/\s(Electron|Daycare|daycare)\/\S+/g, "")

const openOutside = (url: string) => {
  if (URL.parse(url)?.protocol === "https:") {
    void shell.openExternal(url)
  }
}

// Google sign in goes to the sign in window, off host links to the browser
const guardGuest = (guest: WebContents, signInYouTube: () => void) => {
  const redirect = (event: Electron.Event, url: string) => {
    if (isGoogleSignInUrl(url)) {
      event.preventDefault()
      signInYouTube()
      return
    }
    if (isFeedUrl(url)) {
      return
    }
    event.preventDefault()
    openOutside(url)
  }
  const follow = (url: string) => {
    if (isGoogleSignInUrl(url)) {
      signInYouTube()
      return
    }
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
  guest.on("will-navigate", (event, url) => redirect(event, url))
  guest.on("will-redirect", (event, url) => redirect(event, url))
}

export const guardFeedWebviews = (win: BrowserWindow, signInYouTube: () => void) => {
  const feed = session.fromPartition(FEED_PARTITION)
  feed.setUserAgent(browserUserAgent(feed.getUserAgent()))
  trustGoogleSignIn(feed)
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
  win.webContents.on("did-attach-webview", (_event, guest) => guardGuest(guest, signInYouTube))
}
