// User message content for the stream-json input.

import { Schema } from "effect"
import { fileRefText, pathOfFileRef } from "../../shared/files.ts"
import type { FilePath } from "../../shared/ids.ts"
import { asBase64, type ChatImage, ImageMediaType } from "../../shared/images.ts"
import { at, type Json, type JsonObject, obj, str } from "../../shared/json.ts"

export const imageBlock = (image: ChatImage): JsonObject => ({
  type: "image",
  source: { type: "base64", media_type: image.mediaType, data: image.data },
})

const fileRefBlock = (path: FilePath): JsonObject => ({ type: "text", text: fileRefText(path) })

// Plain text, or image and file blocks followed by the text
export const userContent = (text: string, images: ReadonlyArray<ChatImage>, files: ReadonlyArray<FilePath> = []): Json => {
  if (!images.length && !files.length) {
    return text
  }
  const textBlocks: ReadonlyArray<JsonObject> = text ? [{ type: "text", text }] : []
  return [...images.map(imageBlock), ...files.map(fileRefBlock), ...textBlocks]
}

const fileRefOf = (p: Json): FilePath | null => {
  const text = str(at(p, "text"))
  return at(p, "type") === "text" && text ? pathOfFileRef(text) : null
}

// Attached file paths from a user content array
export const filesFromContent = (content: ReadonlyArray<Json>): ReadonlyArray<FilePath> =>
  content.flatMap((p) => {
    const path = fileRefOf(p)
    return path ? [path] : []
  })

// Content parts other than attached file references
export const withoutFileRefs = (content: ReadonlyArray<Json>): ReadonlyArray<Json> => content.filter((p) => !fileRefOf(p))

const isMediaType = Schema.is(ImageMediaType)

// Base64 images from a user content array
export const imagesFromContent = (content: ReadonlyArray<Json>): ReadonlyArray<ChatImage> =>
  content.flatMap((p) => {
    const source = obj(at(p, "source"))
    const mediaType = str(source?.["media_type"])
    const data = str(source?.["data"])
    if (at(p, "type") !== "image" || source?.["type"] !== "base64" || !isMediaType(mediaType) || !data) {
      return []
    }
    return [{ mediaType, data: asBase64(data) }]
  })
