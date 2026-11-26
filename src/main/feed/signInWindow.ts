// Window for signing in to one feed site.

import { BrowserWindow } from "electron"
import { FEED_PARTITION, type FeedPage } from "../../shared/feed.ts"
import { firefoxUserAgent, isGoogleSignInUrl } from "./googleSignIn.ts"

export const openSignInWindow = (page: FeedPage, parent: BrowserWindow) => {
  const win = new BrowserWindow({
    parent,
    width: 520,
    height: 760,
    title: `Sign in to ${page.site}`,
    webPreferences: { partition: FEED_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // Google pages see Firefox in script too, not only in headers
  if (isGoogleSignInUrl(page.signInUrl)) {
    win.webContents.setUserAgent(firefoxUserAgent(process.platform, Date.now()))
  }
  // Popups in the sign in flow stay in this window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (URL.parse(url)?.protocol === "https:") {
      void win.loadURL(url)
    }
    return { action: "deny" }
  })
  void win.loadURL(page.signInUrl)
  return win
}
