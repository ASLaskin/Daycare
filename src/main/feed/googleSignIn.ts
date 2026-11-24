// Firefox identity for Google sign in, which rejects embedded Chromium.

import type { Session } from "electron"

export const GOOGLE_SIGN_IN_HOST = "accounts.google.com"

// Firefox 128 shipped then, with a release every 4 weeks
const FIREFOX_128 = Date.UTC(2024, 6, 9)
const RELEASE_MS = 28 * 24 * 60 * 60 * 1000

const OS: Readonly<Record<string, string>> = {
  darwin: "Macintosh; Intel Mac OS X 10.15",
  win32: "Windows NT 10.0; Win64; x64",
}

export const firefoxUserAgent = (platform: NodeJS.Platform, now: number) => {
  const version = 128 + Math.max(0, Math.floor((now - FIREFOX_128) / RELEASE_MS))
  const os = OS[platform] ?? "X11; Linux x86_64"
  return `Mozilla/5.0 (${os}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`
}

export const isGoogleSignInUrl = (raw: string) => URL.parse(raw)?.hostname === GOOGLE_SIGN_IN_HOST

// Headers Firefox never sends
const isClientHint = (header: string) => header.toLowerCase().startsWith("sec-ch-ua")

export const firefoxHeaders = (headers: Readonly<Record<string, string>>, userAgent: string): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(headers).filter(([k]) => !isClientHint(k) && k.toLowerCase() !== "user-agent")),
  "User-Agent": userAgent,
})

// Google sign in requests look like Firefox
export const trustGoogleSignIn = (ses: Session) => {
  const userAgent = firefoxUserAgent(process.platform, Date.now())
  ses.webRequest.onBeforeSendHeaders({ urls: [`https://${GOOGLE_SIGN_IN_HOST}/*`] }, (details, done) =>
    done({ requestHeaders: firefoxHeaders(details.requestHeaders, userAgent) }),
  )
  return userAgent
}
