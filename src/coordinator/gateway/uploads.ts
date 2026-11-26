// Phone uploads saved under the attachments folder.

import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"
import { base64Bytes, type Base64 } from "../../shared/images.ts"
import { MAX_UPLOAD_BYTES } from "../../shared/mobile.ts"
import { safeFileName } from "../../main/attachments/saved.ts"

export class TooLarge extends Error {}

// Writes the file under its own folder in dir
export const saveUpload = async (dir: DirPath, name: string, data: Base64): Promise<FilePath> => {
  if (base64Bytes(data) > MAX_UPLOAD_BYTES) {
    throw new TooLarge(`uploads are limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB`)
  }
  const folder = path.join(dir, randomUUID())
  const target = path.join(folder, safeFileName(name))
  await mkdir(folder, { recursive: true, mode: 0o700 })
  await writeFile(target, Buffer.from(data, "base64"), { mode: 0o600 })
  return asFilePath(target)
}
