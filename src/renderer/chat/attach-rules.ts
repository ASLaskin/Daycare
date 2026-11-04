// Decides how one file joins the composer.

import { MAX_FILES, MAX_SAVED_BYTES, TOO_LARGE_FILE_MESSAGE, TOO_MANY_FILES_MESSAGE } from "../../shared/files.ts"
import { type ImageMediaType, MAX_IMAGES, MAX_INPUT_BYTES } from "../../shared/images.ts"

export interface Candidate {
  readonly images: number
  readonly files: number
  readonly bytes: number
  readonly mediaType: ImageMediaType | null
  // File has a disk path claude can read
  readonly hasPath: boolean
}

export type Route =
  | { readonly kind: "image"; readonly mediaType: ImageMediaType }
  | { readonly kind: "file" }
  | { readonly kind: "reject"; readonly message: string }

const reject = (message: string): Route => ({ kind: "reject", message })

// Image block when it fits, otherwise a file by path
export const attachRoute = (c: Candidate): Route => {
  if (c.mediaType && c.images < MAX_IMAGES && c.bytes <= MAX_INPUT_BYTES) {
    return { kind: "image", mediaType: c.mediaType }
  }
  if (c.files >= MAX_FILES) {
    return reject(TOO_MANY_FILES_MESSAGE)
  }
  if (!c.hasPath && c.bytes > MAX_SAVED_BYTES) {
    return reject(TOO_LARGE_FILE_MESSAGE)
  }
  return { kind: "file" }
}
