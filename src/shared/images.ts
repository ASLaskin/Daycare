// Chat image attachments shared by main and renderer.

import { Schema } from "effect"

export const ImageMediaType = Schema.Literals(["image/png", "image/jpeg", "image/gif", "image/webp"])
export type ImageMediaType = typeof ImageMediaType.Type

export const Base64 = Schema.String.pipe(Schema.brand("Base64"))
export type Base64 = typeof Base64.Type
export const asBase64 = (s: string) => s as Base64

export const ChatImage = Schema.Struct({ mediaType: ImageMediaType, data: Base64 })
export type ChatImage = typeof ChatImage.Type

export const MAX_IMAGES = 8
// Largest file accepted before downscaling
export const MAX_INPUT_BYTES = 20 * 1024 * 1024
// Largest base64 payload the API accepts per image
export const MAX_BASE64_LENGTH = 5 * 1024 * 1024
// Longest edge kept after downscaling
export const MAX_EDGE_PX = 1568

export const UNSUPPORTED_MESSAGE = "Only PNG, JPEG, GIF and WebP images are supported."
export const TOO_MANY_MESSAGE = `Up to ${MAX_IMAGES} images per message.`
export const TOO_LARGE_MESSAGE = "That image is too large. Try one under 5 MB."

const SIGNATURES: ReadonlyArray<readonly [ImageMediaType, ReadonlyArray<number | null>]> = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  // RIFF, any size, then WEBP
  ["image/webp", [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]],
]

// Media type from the leading bytes, or null
export const detectImageType = (bytes: Uint8Array): ImageMediaType | null => {
  const hit = SIGNATURES.find(([, sig]) => sig.every((b, i) => b === null || bytes[i] === b))
  return hit ? hit[0] : null
}

// Leading bytes of a base64 payload
const headBytes = (data: Base64): Uint8Array => {
  try {
    return Uint8Array.from(atob(data.slice(0, 16)), (c) => c.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

export const detectBase64Type = (data: Base64): ImageMediaType | null => detectImageType(headBytes(data))

// Decoded size of a base64 payload
export const base64Bytes = (data: Base64): number => {
  const padding = Math.min(2, data.length - data.replace(/=+$/, "").length)
  return Math.floor((data.length * 3) / 4) - padding
}

export const imageDataUrl = (image: ChatImage) => `data:${image.mediaType};base64,${image.data}`
