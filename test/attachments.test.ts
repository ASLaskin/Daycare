// Mention extraction, attachment building and main side checks.

import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { existingPath, expandHome, resolveMentions } from "../src/main/attachments/paths.ts"
import { parseRange } from "../src/main/attachments/range.ts"
import { validateUrl } from "../src/main/attachments/urls.ts"
import { aggregate } from "../src/renderer/attachments/aggregate.ts"
import { groupOf, matchesFilter, mentionsOf, pathAttachment, urlAttachment } from "../src/shared/attachments.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import { asDirPath, asFilePath, asHttpUrl, asToolUseId } from "../src/shared/ids.ts"
import { isRunnablePath, kindOfPath, mediaUrl, pathOfMediaUrl } from "../src/shared/media.ts"
import { looksLikePath, parseHttpUrl, pathsIn, tokenize, urlsIn } from "../src/shared/mentions.ts"

const REMIX =
  "The remix is rendered at `oct 9/shrink-split.mp4`: 33.9s ... the config and probe are in `oct 9/shrink-split/`."

const kinds = (text: string) => tokenize(text).map((p) => p.kind)
const joined = (text: string) =>
  tokenize(text)
    .map((p) => p.text)
    .join("")

describe("tokenize", () => {
  test("finds both backticked paths with spaces in the remix message", () => {
    expect(pathsIn(REMIX)).toEqual(["oct 9/shrink-split.mp4", "oct 9/shrink-split/"])
    expect(urlsIn(REMIX)).toEqual([])
    expect(joined(REMIX)).toBe(REMIX)
  })

  test("splits urls and plain paths from prose", () => {
    const text = "See https://example.com/a?b=1, and /tmp/out/demo.mp4. Done"
    expect(kinds(text)).toEqual(["text", "url", "text", "path", "text"])
    expect(urlsIn(text)).toEqual([asHttpUrl("https://example.com/a?b=1")])
    expect(pathsIn(text)).toEqual(["/tmp/out/demo.mp4"])
    expect(joined(text)).toBe(text)
  })

  test("continues plain absolute paths across spaces into the next folder", () => {
    expect(pathsIn("Saved to /Users/me/oct 9/clip.mp4 just now")).toEqual(["/Users/me/oct 9/clip.mp4"])
    expect(pathsIn("open /tmp/a.mp4 and/or that")).toEqual(["/tmp/a.mp4"])
    expect(pathsIn("look in /usr/local and src")).toEqual(["/usr/local"])
  })

  test("takes relative and home paths", () => {
    expect(pathsIn("wrote src/main/x.ts and out/renders/ plus ~/notes/a.md")).toEqual([
      "src/main/x.ts",
      "out/renders/",
      "~/notes/a.md",
    ])
    expect(pathsIn("ran ./build.sh then ../up/a.txt")).toEqual(["./build.sh", "../up/a.txt"])
    expect(pathsIn("and/or km/h 33.9s ...")).toEqual([])
  })

  test("keeps paths inside urls as part of the url", () => {
    expect(pathsIn("go to https://example.com/docs/readme.md now")).toEqual([])
    expect(urlsIn("go to https://example.com/docs/readme.md now")).toHaveLength(1)
  })

  test("trims trailing punctuation and unbalanced parens from urls", () => {
    expect(urlsIn("(see https://example.com/x).")).toEqual([asHttpUrl("https://example.com/x")])
    expect(urlsIn("[docs](https://example.com/y)")).toEqual([asHttpUrl("https://example.com/y")])
  })

  test("links urls inside backticks", () => {
    expect(kinds("open `https://example.com/z` now")).toEqual(["text", "url", "text"])
  })

  test("ignores non http schemes and command looking code", () => {
    expect(urlsIn("javascript:alert(1) and file:///etc/passwd")).toEqual([])
    expect(parseHttpUrl("ftp://example.com")).toBeNull()
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull()
    expect(pathsIn("run `npm test` and `ls | grep x` and `$HOME/a.txt`")).toEqual([])
  })

  test("decides when inline code reads as a path", () => {
    expect(looksLikePath("oct 9/shrink-split.mp4")).toBe(true)
    expect(looksLikePath("README.md")).toBe(true)
    expect(looksLikePath("npm run build")).toBe(false)
    expect(looksLikePath(" padded.txt")).toBe(false)
  })
})

describe("mentionsOf", () => {
  const toolStart = (name: string, input: Record<string, string>): ChatEvent => ({
    kind: "tool-start",
    toolUseId: asToolUseId("t1"),
    name,
    title: name,
    input,
    parentToolUseId: null,
  })

  test("reads assistant text, including the remix message", () => {
    const m = mentionsOf({ kind: "text", block: "1", text: REMIX })
    expect(m.paths).toEqual(["oct 9/shrink-split.mp4", "oct 9/shrink-split/"])
  })

  test("reads user text", () => {
    expect(mentionsOf({ kind: "user", text: "look at /tmp/shot.png and https://a.dev" })).toMatchObject({
      paths: ["/tmp/shot.png"],
      urls: ["https://a.dev/"],
    })
  })

  test("remembers written paths and ignores other tools", () => {
    expect(mentionsOf(toolStart("Write", { file_path: "rel/c.ts" })).written).toEqual({ toolUseId: asToolUseId("t1"), path: "rel/c.ts" })
    expect(mentionsOf(toolStart("NotebookEdit", { notebook_path: "/n.ipynb" })).written?.path).toBe("/n.ipynb")
    expect(mentionsOf(toolStart("Read", { file_path: "/a/b.ts" })).written).toBeNull()
  })
})

describe("attachments", () => {
  test("builds files, folders and urls", () => {
    const video = pathAttachment({ raw: "oct 9/shrink-split.mp4", path: asFilePath("/w/oct 9/shrink-split.mp4"), isDir: false })
    expect(video).toMatchObject({ kind: "video", name: "shrink-split.mp4", dir: "/w/oct 9" })
    const folder = pathAttachment({ raw: "oct 9/shrink-split/", path: asFilePath("/w/oct 9/shrink-split"), isDir: true })
    expect(folder).toMatchObject({ kind: "folder", name: "shrink-split", dir: "/w/oct 9" })
    expect(urlAttachment(asHttpUrl("https://www.example.com/path/My%20Doc"))).toMatchObject({ host: "example.com", title: "My Doc" })
  })

  test("groups and filters by kind", () => {
    const img = pathAttachment({ raw: "", path: asFilePath("/a/i.png"), isDir: false })
    const vid = pathAttachment({ raw: "", path: asFilePath("/a/v.mp4"), isDir: false })
    const dir = pathAttachment({ raw: "", path: asFilePath("/a/d"), isDir: true })
    const url = urlAttachment(asHttpUrl("https://example.com"))
    expect([img, vid, dir, url].map(groupOf)).toEqual(["images", "files", "folders", "urls"])
    expect([img, vid, dir, url].map((a) => matchesFilter(a, "folders"))).toEqual([false, false, true, false])
    expect([img, vid, dir, url].every((a) => matchesFilter(a, "all"))).toBe(true)
  })

  test("merges a master and its workers, deduped and ordered by last mention", () => {
    const img = pathAttachment({ raw: "", path: asFilePath("/a/i.png"), isDir: false })
    const url = urlAttachment(asHttpUrl("https://example.com"))
    const dir = pathAttachment({ raw: "", path: asFilePath("/a/d"), isDir: true })
    const merged = aggregate([
      { name: "remix", seen: [{ attachment: img, seq: 1 }, { attachment: url, seq: 2 }] },
      { name: "worker one", seen: [{ attachment: dir, seq: 3 }, { attachment: img, seq: 4 }] },
      { name: "worker two", seen: [] },
    ])
    expect(merged.map((m) => [m.attachment.key, m.chats])).toEqual([
      [url.key, ["remix"]],
      [dir.key, ["worker one"]],
      [img.key, ["remix", "worker one"]],
    ])
    expect(aggregate([])).toEqual([])
  })

  test("classifies by extension", () => {
    expect(kindOfPath("/a/b.JPEG")).toBe("image")
    expect(kindOfPath("/a/b.mov")).toBe("video")
    expect(kindOfPath("/a/b.mp3")).toBe("audio")
    expect(kindOfPath("/a/b.ts")).toBe("file")
    expect(isRunnablePath("/a/Thing.app")).toBe(true)
    expect(isRunnablePath("/a/b.png")).toBe(false)
  })

  test("round trips media urls with spaces", () => {
    const p = asFilePath("/w/oct 9/shrink-split.mp4")
    expect(pathOfMediaUrl(mediaUrl(p))).toBe(p)
    expect(pathOfMediaUrl("https://local/w/a.mp4")).toBeNull()
  })
})

describe("main checks", () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-att-")))
  fs.mkdirSync(path.join(tmp, "oct 9", "shrink-split"), { recursive: true })
  const video = path.join(tmp, "oct 9", "shrink-split.mp4")
  fs.writeFileSync(video, Buffer.from([1, 2, 3]))
  const cwd = asDirPath(tmp)
  const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(e))

  test("resolves the remix paths against the session cwd", async () => {
    const found = await Effect.runPromise(resolveMentions({ cwd, paths: pathsIn(REMIX) }, tmp))
    expect(found).toEqual([
      { raw: "oct 9/shrink-split.mp4", path: asFilePath(video), isDir: false },
      { raw: "oct 9/shrink-split/", path: asFilePath(path.join(tmp, "oct 9", "shrink-split")), isDir: true },
    ])
  })

  test("drops missing paths and relative paths without an absolute cwd", async () => {
    expect(await Effect.runPromise(resolveMentions({ cwd, paths: ["nope.mp4", "/no/such/x.png"] }, tmp))).toEqual([])
    expect(await Effect.runPromise(resolveMentions({ cwd: asDirPath("rel"), paths: ["oct 9/shrink-split.mp4"] }, tmp))).toEqual([])
  })

  test("opens only existing absolute paths", async () => {
    expect((await run(existingPath(video, tmp)))._tag).toBe("Success")
    expect((await run(existingPath(tmp, tmp)))._tag).toBe("Success")
    expect((await run(existingPath(path.join(tmp, "nope.png"), tmp)))._tag).toBe("Failure")
    expect((await run(existingPath("relative.png", tmp)))._tag).toBe("Failure")
    expect((await run(existingPath("/etc/\0passwd", tmp)))._tag).toBe("Failure")
  })

  test("expands the home prefix", async () => {
    expect(expandHome("~/oct 9/shrink-split.mp4", tmp)).toBe(video)
    expect((await run(existingPath("~/oct 9/shrink-split.mp4", tmp)))._tag).toBe("Success")
  })

  test("accepts only http and https urls", async () => {
    expect((await run(validateUrl("https://example.com")))._tag).toBe("Success")
    expect((await run(validateUrl("file:///etc/passwd")))._tag).toBe("Failure")
    expect((await run(validateUrl("javascript:alert(1)")))._tag).toBe("Failure")
  })

  test("parses byte ranges", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange("bytes=200-", 100)).toBeNull()
    expect(parseRange("items=0-1", 100)).toBeNull()
  })
})
