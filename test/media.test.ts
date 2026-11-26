// Media a session mentions: sniffing, candidates, and what may be served.

import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { candidatesOf, makeMediaIndex } from "../src/coordinator/media.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import { asDirPath, asFilePath, asSessionId, asToolUseId } from "../src/shared/ids.ts"
import { sniffMedia } from "../src/shared/media.ts"
import type { HistoryRow } from "../src/shared/mobile.ts"

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-media-")))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0])
const MP4 = Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 0, 0])

const cwd = path.join(root, "project")
const outside = path.join(root, "outside")
fs.mkdirSync(cwd)
fs.mkdirSync(outside)
const write = (file: string, bytes: Buffer | string) => {
  fs.writeFileSync(file, bytes)
  return file
}

describe("sniffing", () => {
  test("reads the bytes, not the name", () => {
    expect(sniffMedia(PNG)).toEqual({ mimeType: "image/png", kind: "image" })
    expect(sniffMedia(MP4)).toEqual({ mimeType: "video/mp4", kind: "video" })
    expect(sniffMedia(Buffer.from([0, 0, 0, 0x14, ...Buffer.from("ftypqt  ")]))).toEqual({ mimeType: "video/quicktime", kind: "video" })
    expect(sniffMedia(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toEqual({ mimeType: "image/webp", kind: "image" })
    expect(sniffMedia(Buffer.from("not media at all"))).toBeNull()
  })
})

describe("candidates", () => {
  test("tool inputs, tool output and text yield media looking paths only", () => {
    const start: ChatEvent = { kind: "tool-start", toolUseId: asToolUseId("t"), name: "Bash", title: "", input: { command: "ffmpeg -i in.mov out/clip.mp4 && cat notes.txt" }, parentToolUseId: null }
    expect(candidatesOf(start)).toEqual(["out/clip.mp4", "in.mov"])
    expect(candidatesOf({ kind: "text", block: "b", text: "Saved `/tmp/a.png` and /tmp/b.txt" })).toEqual(["/tmp/a.png"])
    expect(candidatesOf({ kind: "tool-end", toolUseId: asToolUseId("t"), isError: false, content: "wrote ./shot.jpg", structured: null })).toEqual(["./shot.jpg"])
  })
})

describe("index", () => {
  const id = asSessionId("s")
  const make = (rows: ReadonlyArray<HistoryRow> = []) => makeMediaIndex({ cwd: () => asDirPath(cwd), rows: () => rows, home: root })

  test("a file a tool creates is reported once it exists, then again only when it changes", () => {
    const index = make()
    const file = path.join(cwd, "render.mp4")
    const start: ChatEvent = { kind: "tool-start", toolUseId: asToolUseId("w"), name: "Bash", title: "", input: { command: "render render.mp4" }, parentToolUseId: null }
    const end: ChatEvent = { kind: "tool-end", toolUseId: asToolUseId("w"), isError: false, content: "", structured: null }
    expect(index.notice(id, 1, start)).toEqual([])
    write(file, MP4)
    expect(index.notice(id, 2, end).map((m) => [m.path, m.mimeType, m.kind, m.entry])).toEqual([[file, "video/mp4", "video", 2]])
    expect(index.notice(id, 3, { kind: "text", block: "b", text: "see render.mp4" })).toEqual([])
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))
    expect(index.notice(id, 4, { kind: "text", block: "c", text: "updated render.mp4" }).map((m) => m.entry)).toEqual([4])
  })

  test("listing scans history once and drops files that are gone", () => {
    const a = write(path.join(outside, "a.png"), PNG)
    const b = write(path.join(cwd, "b.png"), PNG)
    const rows: ReadonlyArray<HistoryRow> = [
      { entry: 3, event: { kind: "text", block: "x", text: `made ${a}` } },
      { entry: 7, event: { kind: "user", text: "", images: [], omittedImages: 0, files: [asFilePath(b)] } },
    ]
    const index = make(rows)
    expect(index.list(id).map((m) => [m.name, m.entry])).toEqual([["b.png", 7], ["a.png", 3]])
    fs.rmSync(b)
    expect(index.list(id).map((m) => m.name)).toEqual(["a.png"])
  })

  test("serves mentioned files and files under cwd, nothing else", () => {
    const mentioned = write(path.join(outside, "mentioned.png"), PNG)
    const secret = write(path.join(outside, "secret.png"), PNG)
    const local = write(path.join(cwd, "local.png"), PNG)
    const text = write(path.join(cwd, "fake.png"), "plain text")
    fs.symlinkSync(secret, path.join(cwd, "link.png"))
    const index = make([{ entry: 1, event: { kind: "text", block: "x", text: mentioned } }])
    expect(index.resolve(id, mentioned)?.entry).toBe(1)
    expect(index.resolve(id, local)?.entry).toBeNull()
    expect(index.resolve(id, secret)).toBeNull()
    expect(index.resolve(id, path.join(cwd, "link.png"))).toBeNull()
    expect(index.resolve(id, text)).toBeNull()
    expect(index.resolve(id, "local.png")).toBeNull()
  })
})
