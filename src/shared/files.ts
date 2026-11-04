// Non-image chat attachments, passed to claude by path.

import { Schema } from "effect"
import { asFilePath, type FilePath } from "./ids.ts"
import { Base64 } from "./images.ts"

export const MAX_FILES = 20
// Largest path-less file saved for claude to read
export const MAX_SAVED_BYTES = 50 * 1024 * 1024

export const TOO_MANY_FILES_MESSAGE = `Up to ${MAX_FILES} files per message.`
export const TOO_LARGE_FILE_MESSAGE = "That file is too large. Try one under 50 MB."

// Path-less file the renderer asks main to store
export const SaveFileRequest = Schema.Struct({ name: Schema.String, data: Base64 })
export type SaveFileRequest = typeof SaveFileRequest.Type

const REF_PREFIX = "Attached file: "

// Text block telling claude where an attached file lives
export const fileRefText = (path: FilePath) => `${REF_PREFIX}${path}`

export const pathOfFileRef = (text: string): FilePath | null => {
  const rest = text.startsWith(REF_PREFIX) ? text.slice(REF_PREFIX.length) : ""
  return rest.startsWith("/") && !rest.includes("\n") ? asFilePath(rest) : null
}

export const fileName = (path: FilePath): string => path.replace(/\/+$/, "").split("/").pop() || path
