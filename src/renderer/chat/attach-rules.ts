// Checks one file before it joins the composer.

import {
  type ImageMediaType,
  MAX_IMAGES,
  MAX_INPUT_BYTES,
  TOO_LARGE_MESSAGE,
  TOO_MANY_MESSAGE,
  UNSUPPORTED_MESSAGE,
} from "../../shared/images.ts"

export interface Candidate {
  // Images already attached
  readonly attached: number
  readonly bytes: number
  readonly mediaType: ImageMediaType | null
}

// Reason to reject the file, or null
export const attachProblem = (c: Candidate): string | null => {
  if (c.attached >= MAX_IMAGES) {
    return TOO_MANY_MESSAGE
  }
  if (!c.mediaType) {
    return UNSUPPORTED_MESSAGE
  }
  return c.bytes > MAX_INPUT_BYTES ? TOO_LARGE_MESSAGE : null
}
