import { describe, expect, test } from "bun:test"
import { feedAccounts, feedPage, isFeedUrl, pageCookies, pageOrigins } from "../src/shared/feed.ts"

const instagram = feedPage("reels")!
const youtube = feedPage("shorts")!

describe("feedAccounts", () => {
  test("connected only with the site's session cookie", () => {
    const cookies = [
      { name: "sessionid", domain: ".instagram.com" },
      { name: "SAPISID", domain: ".youtube.com" },
    ]
    expect(feedAccounts(cookies)).toEqual([
      { id: "reels", connected: true },
      { id: "shorts", connected: false },
    ])
  })

  test("ignores a session cookie from a lookalike host", () => {
    expect(feedAccounts([{ name: "LOGIN_INFO", domain: ".notyoutube.com" }])).toEqual([
      { id: "reels", connected: false },
      { id: "shorts", connected: false },
    ])
  })
})

describe("disconnect targets", () => {
  test("clears every cookie on the site's hosts and nothing else", () => {
    const cookies = [
      { name: "a", domain: ".youtube.com" },
      { name: "b", domain: "accounts.google.com" },
      { name: "c", domain: ".instagram.com" },
      { name: "d" },
    ]
    expect(pageCookies(youtube, cookies).map((c) => c.name)).toEqual(["a", "b"])
    expect(pageCookies(instagram, cookies).map((c) => c.name)).toEqual(["c"])
  })

  test("clears bare and www origins", () => {
    expect(pageOrigins(instagram)).toEqual(["https://instagram.com", "https://www.instagram.com", "https://facebook.com", "https://www.facebook.com"])
  })
})

describe("isFeedUrl", () => {
  test("allows https pages on feed hosts only", () => {
    expect(isFeedUrl("https://www.instagram.com/reels/")).toBe(true)
    expect(isFeedUrl("https://m.youtube.com/shorts/x")).toBe(true)
    expect(isFeedUrl("http://www.youtube.com/")).toBe(false)
    expect(isFeedUrl("https://evil-instagram.com/")).toBe(false)
    expect(isFeedUrl("not a url")).toBe(false)
  })
})
