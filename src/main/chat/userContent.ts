// User message content for the stream-json input.

import { Schema } from "effect"
import { asBase64, type ChatImage, ImageMediaType } from "../../shared/images.ts"
import { at, type Json, type JsonObject, obj, str } from "../../shared/json.ts"

export const imageBlock = (image: ChatImage): JsonObject => ({
  type: "image",
  source: { type: "base64", media_type: image.mediaType, data: image.data },
})

// Plain text, or image blocks followed by the text
export const userContent = (text: string, images: ReadonlyArray<ChatImage>): Json => {
  if (!images.length) {
    return text
  }
  const textBlocks: ReadonlyArray<JsonObject> = text ? [{ type: "text", text }] : []
  return [...images.map(imageBlock), ...textBlocks]
}

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
