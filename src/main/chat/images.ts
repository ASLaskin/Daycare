// Validates chat images before they reach claude.

import { Effect, Schema } from "effect"
import {
  base64Bytes,
  type ChatImage,
  detectBase64Type,
  type ImageMediaType,
  MAX_BASE64_LENGTH,
  MAX_EDGE_PX,
  MAX_IMAGES,
  MAX_INPUT_BYTES,
  TOO_LARGE_MESSAGE,
  TOO_MANY_MESSAGE,
  UNSUPPORTED_MESSAGE,
} from "../../shared/images.ts"

export class ImageError extends Schema.TaggedError<ImageError>()("ImageError", { message: Schema.String }) {}

// Re-encodes an image to fit the limits, or null when it cannot
export type Downscale = (image: ChatImage) => ChatImage | null

export interface Size {
  readonly width: number
  readonly height: number
}

const RESIZABLE = new Set<ImageMediaType>(["image/png", "image/jpeg"])
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

// Target size within the edge limit, or null when it already fits
export const fitSize = (size: Size, maxEdge = MAX_EDGE_PX): Size | null => {
  const edge = Math.max(size.width, size.height)
  if (edge <= maxEdge) {
    return null
  }
  const scale = maxEdge / edge
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }
}

const fail = (message: string) => Effect.fail(new ImageError({ message }))

const prepareImage = (image: ChatImage, downscale: Downscale): Effect.Effect<ChatImage, ImageError> => {
  const mediaType = detectBase64Type(image.data)
  if (!mediaType || !BASE64_PATTERN.test(image.data)) {
    return fail(UNSUPPORTED_MESSAGE)
  }
  if (base64Bytes(image.data) > MAX_INPUT_BYTES) {
    return fail(TOO_LARGE_MESSAGE)
  }
  const typed: ChatImage = { mediaType, data: image.data }
  const fitted = RESIZABLE.has(mediaType) ? (downscale(typed) ?? typed) : typed
  if (fitted.data.length > MAX_BASE64_LENGTH) {
    return fail(TOO_LARGE_MESSAGE)
  }
  return Effect.succeed(fitted)
}

// Checked images with the type taken from their bytes
export const prepareImages = (
  images: ReadonlyArray<ChatImage>,
  downscale: Downscale,
): Effect.Effect<ReadonlyArray<ChatImage>, ImageError> =>
  images.length > MAX_IMAGES ? fail(TOO_MANY_MESSAGE) : Effect.forEach(images, (image) => prepareImage(image, downscale))
