import { Effect } from "effect"
import type { HttpUrl } from "../../shared/ids.ts"
import { parseHttpUrl } from "../../shared/mentions.ts"
import { AttachmentError } from "./AttachmentError.ts"

export const validateUrl = (raw: string): Effect.Effect<HttpUrl, AttachmentError> => {
  const url = parseHttpUrl(raw)
  return url ? Effect.succeed(url) : Effect.fail(new AttachmentError("Only http and https links can be opened"))
}
