import { describe, expect, test } from "bun:test"
import { firefoxHeaders, firefoxUserAgent, isGoogleSignInUrl } from "../src/main/feed/googleSignIn.ts"
import { mobileUserAgent } from "../src/shared/feed.ts"

describe("firefoxUserAgent", () => {
  test("tracks the current Firefox release", () => {
    expect(firefoxUserAgent("darwin", Date.UTC(2025, 5, 24))).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    )
    expect(firefoxUserAgent("linux", Date.UTC(2024, 0, 1))).toContain("(X11; Linux x86_64; rv:128.0)")
  })
})

describe("firefoxHeaders", () => {
  test("drops client hints and replaces the user agent", () => {
    const headers = { "sec-ch-ua": "x", "Sec-CH-UA-Platform": "macOS", "user-agent": "Chrome", Accept: "*/*" }
    expect(firefoxHeaders(headers, "Firefox")).toEqual({ Accept: "*/*", "User-Agent": "Firefox" })
  })
})

describe("isGoogleSignInUrl", () => {
  test("matches only the accounts host", () => {
    expect(isGoogleSignInUrl("https://accounts.google.com/ServiceLogin")).toBe(true)
    expect(isGoogleSignInUrl("https://www.youtube.com/shorts")).toBe(false)
    expect(isGoogleSignInUrl("nope")).toBe(false)
  })
})

describe("mobileUserAgent", () => {
  test("keeps the engine's Chrome version", () => {
    expect(mobileUserAgent("Mozilla/5.0 (Macintosh) Chrome/138.0.7204.0 Safari/537.36")).toContain("Chrome/138.0.0.0 Mobile Safari")
  })
})
