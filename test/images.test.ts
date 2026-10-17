// Image detection, limits, history caps and content blocks.

import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { fitSize, prepareImages } from "../src/main/chat/images.ts"
import { keepRecentImages } from "../src/main/chat/historyImages.ts"
import { imagesFromContent, userContent } from "../src/main/chat/userContent.ts"
import { attachProblem } from "../src/renderer/chat/attach-rules.ts"
import type { ChatEvent } from "../src/shared/chat.ts"
import {
  asBase64,
  base64Bytes,
  type ChatImage,
  detectBase64Type,
  detectImageType,
  MAX_BASE64_LENGTH,
  MAX_IMAGES,
  MAX_INPUT_BYTES,
  TOO_LARGE_MESSAGE,
  TOO_MANY_MESSAGE,
  UNSUPPORTED_MESSAGE,
} from "../src/shared/images.ts"

const b64 = (bytes: ReadonlyArray<number>, pad = 0) => asBase64(Buffer.from([...bytes, ...Array<number>(pad).fill(0)]).toString("base64"))

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]

const png: ChatImage = { mediaType: "image/png", data: b64(PNG, 8) }
const keep = (image: ChatImage) => image

const failure = <A, E extends { readonly message: string }>(eff: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(eff)
  return Exit.isFailure(exit) ? exit.cause.toString() : null
}

describe("type detection", () => {
  test("recognizes each allowed type by its bytes", () => {
    expect([PNG, JPEG, GIF, WEBP].map((b) => detectImageType(new Uint8Array(b)))).toEqual(["image/png", "image/jpeg", "image/gif", "image/webp"])
  })

  test("rejects other formats and short input", () => {
    expect(detectImageType(new Uint8Array(PDF))).toBeNull()
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
    expect(detectImageType(new Uint8Array([0x89, 0x50]))).toBeNull()
  })

  test("works from base64, tolerating garbage", () => {
    expect(detectBase64Type(b64(GIF, 20))).toBe("image/gif")
    expect(detectBase64Type(asBase64("!!!not base64"))).toBeNull()
  })

  test("decoded size accounts for padding", () => {
    expect([1, 2, 3, 10].map((n) => base64Bytes(b64(Array<number>(n).fill(7))))).toEqual([1, 2, 3, 10])
  })
})

describe("attach rules", () => {
  test("count, then type, then size", () => {
    expect(attachProblem({ attached: MAX_IMAGES, bytes: 1, mediaType: null })).toBe(TOO_MANY_MESSAGE)
    expect(attachProblem({ attached: 0, bytes: 1, mediaType: null })).toBe(UNSUPPORTED_MESSAGE)
    expect(attachProblem({ attached: 0, bytes: MAX_INPUT_BYTES + 1, mediaType: "image/png" })).toBe(TOO_LARGE_MESSAGE)
    expect(attachProblem({ attached: MAX_IMAGES - 1, bytes: MAX_INPUT_BYTES, mediaType: "image/webp" })).toBeNull()
  })
})

describe("prepareImages", () => {
  test("takes the media type from the bytes", () => {
    const mislabeled: ChatImage = { mediaType: "image/png", data: b64(JPEG, 8) }
    expect(Effect.runSync(prepareImages([mislabeled], keep))).toEqual([{ mediaType: "image/jpeg", data: mislabeled.data }])
  })

  test("rejects too many, unsupported and invalid payloads", () => {
    expect(failure(prepareImages(Array<ChatImage>(MAX_IMAGES + 1).fill(png), keep))).toContain(TOO_MANY_MESSAGE)
    expect(failure(prepareImages([{ mediaType: "image/png", data: b64(PDF, 8) }], keep))).toContain(UNSUPPORTED_MESSAGE)
    expect(failure(prepareImages([{ mediaType: "image/png", data: asBase64(`${png.data}\n<script>`) }], keep))).toContain(UNSUPPORTED_MESSAGE)
  })

  test("downscales only PNG and JPEG", () => {
    const calls: Array<string> = []
    const shrink = (image: ChatImage): ChatImage => {
      calls.push(image.mediaType)
      return { mediaType: "image/jpeg", data: b64(JPEG) }
    }
    const gif: ChatImage = { mediaType: "image/gif", data: b64(GIF, 8) }
    const out = Effect.runSync(prepareImages([png, gif], shrink))
    expect(calls).toEqual(["image/png"])
    expect(out.map((i) => i.mediaType)).toEqual(["image/jpeg", "image/gif"])
  })

  test("rejects images still over the limit after downscaling", () => {
    const big = asBase64(b64(PNG, 7) + "A".repeat(MAX_BASE64_LENGTH))
    expect(failure(prepareImages([{ mediaType: "image/png", data: big }], () => null))).toContain(TOO_LARGE_MESSAGE)
    const gif = asBase64(b64(GIF, 3) + "A".repeat(MAX_BASE64_LENGTH))
    expect(failure(prepareImages([{ mediaType: "image/gif", data: gif }], keep))).toContain(TOO_LARGE_MESSAGE)
  })

  test("fitSize keeps aspect and skips images within the edge", () => {
    expect(fitSize({ width: 1000, height: 800 })).toBeNull()
    expect(fitSize({ width: 4000, height: 2000 }, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitSize({ width: 10, height: 9000 }, 900)).toEqual({ width: 1, height: 900 })
  })
})

describe("content blocks", () => {
  test("plain text stays a string", () => {
    expect(userContent("hi", [])).toBe("hi")
  })

  test("images come first as base64 blocks, then the text", () => {
    expect(userContent("look", [png])).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: png.data } },
      { type: "text", text: "look" },
    ])
    expect(userContent("", [png])).toEqual([{ type: "image", source: { type: "base64", media_type: "image/png", data: png.data } }])
  })

  test("images round trip from content, skipping other parts", () => {
    const content = userContent("look", [png])
    const parts = Array.isArray(content) ? content : []
    const extra = [{ type: "image", source: { type: "url", url: "https://x" } }, { type: "image", source: { type: "base64", media_type: "image/bmp", data: "AA" } }]
    expect(imagesFromContent([...parts, ...extra])).toEqual([png])
  })
})

describe("history image cap", () => {
  const user = (n: number): ChatEvent => ({ kind: "user", text: `m${n}`, images: Array<ChatImage>(n).fill(png), omittedImages: 0 })

  test("keeps the newest images and counts the rest", () => {
    const out = keepRecentImages([user(3), { kind: "error", message: "x" }, user(2), user(2)], 3)
    expect(out.map((e) => (e.kind === "user" ? [e.images.length, e.omittedImages] : e.kind))).toEqual([[0, 3], "error", [1, 1], [2, 0]])
  })

  test("leaves history under the cap untouched", () => {
    const events = [user(1), user(2)]
    expect(keepRecentImages(events, 3)).toEqual(events)
  })
})
