import { describe, expect, test } from "bun:test"
import { boxToHide, chromeCss, chromeScript } from "../src/renderer/feed/chrome.ts"

class Node {
  readonly kids: Node[] = []
  constructor(
    readonly name: string,
    readonly parentElement: Node | null = null,
  ) {
    parentElement?.kids.push(this)
  }
  contains(other: Node): boolean {
    return other === this || this.kids.some((k) => k.contains(other))
  }
}

// body > app > (header > logo, feed > video, nav > home), overlay > dialog > link
const tree = () => {
  const body = new Node("body")
  const app = new Node("app", body)
  const header = new Node("header", app)
  const logo = new Node("logo", header)
  const feed = new Node("feed", app)
  const video = new Node("video", feed)
  const nav = new Node("nav", app)
  const home = new Node("home", nav)
  const overlay = new Node("overlay", body)
  const dialog = new Node("dialog", overlay)
  const link = new Node("link", dialog)
  const isProtected = (n: Node) => n.contains(video)
  return { body, app, header, logo, feed, video, nav, home, overlay, link, isProtected }
}

describe("boxToHide", () => {
  test("climbs to the outermost box beside the video", () => {
    const t = tree()
    expect(boxToHide(t.logo, t.body, t.isProtected)).toBe(t.header)
    expect(boxToHide(t.home, t.body, t.isProtected)).toBe(t.nav)
  })

  test("a popup outside the app hides up to the body child", () => {
    const t = tree()
    expect(boxToHide(t.link, t.body, t.isProtected)).toBe(t.overlay)
  })

  test("never hides the video, its ancestors, or the root", () => {
    const t = tree()
    expect(boxToHide(t.video, t.body, t.isProtected)).toBeNull()
    expect(boxToHide(t.feed, t.body, t.isProtected)).toBeNull()
    expect(boxToHide(t.body, t.body, t.isProtected)).toBeNull()
  })

  test("ignores anchors outside the root", () => {
    const t = tree()
    expect(boxToHide(new Node("stray"), t.body, t.isProtected)).toBeNull()
  })
})

describe("chrome injection", () => {
  test.each(["reels", "shorts"] as const)("%s script compiles and css is present", (tab) => {
    expect(() => new Function(chromeScript(tab))).not.toThrow()
    expect(chromeCss(tab).length).toBeGreaterThan(0)
  })
})
