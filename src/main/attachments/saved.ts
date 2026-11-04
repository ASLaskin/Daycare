// Stores path-less attachments so claude can read them.

import { Effect } from "effect"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { MAX_SAVED_BYTES, type SaveFileRequest, TOO_LARGE_FILE_MESSAGE } from "../../shared/files.ts"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"
import { base64Bytes } from "../../shared/images.ts"
import { AttachmentError } from "./AttachmentError.ts"

const FALLBACK_NAME = "attachment"
const MAX_NAME_LENGTH = 120

// Base name safe to create inside the attachments folder
export const safeFileName = (name: string): string => {
  const base = (name.split(/[\\/]/).pop() ?? "").replaceAll("\0", "").trim()
  if (!base || base === "." || base === "..") {
    return FALLBACK_NAME
  }
  return base.length > MAX_NAME_LENGTH ? base.slice(-MAX_NAME_LENGTH) : base
}

// Writes the file under its own folder in dir
export const saveAttachment = (dir: DirPath, req: SaveFileRequest): Effect.Effect<FilePath, AttachmentError> => {
  if (base64Bytes(req.data) > MAX_SAVED_BYTES) {
    return Effect.fail(new AttachmentError(TOO_LARGE_FILE_MESSAGE))
  }
  const folder = path.join(dir, randomUUID())
  const target = path.join(folder, safeFileName(req.name))
  return Effect.tryPromise({
    try: async () => {
      await fs.mkdir(folder, { recursive: true })
      await fs.writeFile(target, Buffer.from(req.data, "base64"))
      return asFilePath(target)
    },
    catch: () => new AttachmentError("Could not save that file."),
  })
}
