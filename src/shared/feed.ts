// Reels and Shorts pages, their sites, and sign in state.

import { asHttpUrl, type HttpUrl } from "./ids.ts"
import type { FeedTab } from "./settings.ts"

// Persistent so logins survive restarts
export const FEED_PARTITION = "persist:feed"

export interface FeedPage {
  readonly id: FeedTab
  readonly label: string
  readonly site: string
  readonly url: HttpUrl
  readonly signInUrl: HttpUrl
  // Hosts the page may navigate within and whose data it owns
  readonly hosts: ReadonlyArray<string>
  // Cookie present only while signed in
  readonly sessionCookie: { readonly host: string; readonly name: string }
  // Mobile layout shows one full height video at a time
  readonly mobile: boolean
}

const YOUTUBE_SIGN_IN = `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent("https://www.youtube.com/signin?action_handle_signin=true&next=/shorts")}`

export const FEED_PAGES: ReadonlyArray<FeedPage> = [
  {
    id: "reels",
    label: "Reels",
    site: "Instagram",
    url: asHttpUrl("https://www.instagram.com/reels/"),
    signInUrl: asHttpUrl("https://www.instagram.com/accounts/login/"),
    hosts: ["instagram.com", "facebook.com"],
    sessionCookie: { host: "instagram.com", name: "sessionid" },
    mobile: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    site: "YouTube",
    url: asHttpUrl("https://www.youtube.com/shorts"),
    signInUrl: asHttpUrl(YOUTUBE_SIGN_IN),
    hosts: ["youtube.com", "google.com", "youtu.be"],
    sessionCookie: { host: "youtube.com", name: "LOGIN_INFO" },
    mobile: false,
  },
]

export interface FeedAccount {
  readonly id: FeedTab
  readonly connected: boolean
}

// Cookie fields the account checks read
export interface CookieRef {
  readonly name: string
  readonly domain?: string | undefined
}

const hostMatches = (host: string, allowed: string) => host === allowed || host.endsWith(`.${allowed}`)

const cookieHost = (c: CookieRef) => (c.domain ?? "").replace(/^\./, "")

// Https url on one of the feed hosts
export const isFeedUrl = (raw: string) => {
  const url = URL.parse(raw)
  if (!url || url.protocol !== "https:") {
    return false
  }
  return FEED_PAGES.some((p) => p.hosts.some((h) => hostMatches(url.hostname, h)))
}

export const isConnected = (page: FeedPage, cookies: ReadonlyArray<CookieRef>) =>
  cookies.some((c) => c.name === page.sessionCookie.name && hostMatches(cookieHost(c), page.sessionCookie.host))

export const feedAccounts = (cookies: ReadonlyArray<CookieRef>): ReadonlyArray<FeedAccount> =>
  FEED_PAGES.map((p) => ({ id: p.id, connected: isConnected(p, cookies) }))

// Cookies a disconnect clears
export const pageCookies = <C extends CookieRef>(page: FeedPage, cookies: ReadonlyArray<C>) =>
  cookies.filter((c) => page.hosts.some((h) => hostMatches(cookieHost(c), h)))

// Origins whose storage a disconnect clears
export const pageOrigins = (page: FeedPage) => page.hosts.flatMap((h) => [`https://${h}`, `https://www.${h}`])

export const feedPage = (id: FeedTab) => FEED_PAGES.find((p) => p.id === id)

// Android Chrome user agent matching the engine's version
export const mobileUserAgent = (desktop: string) => {
  const chrome = /Chrome\/(\d+)/.exec(desktop)?.[1] ?? "140"
  return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Mobile Safari/537.36`
}
