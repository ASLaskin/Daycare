// Checks attached file paths before they reach claude.

import { Effect } from "effect"
import { fileName, MAX_FILES, TOO_MANY_FILES_MESSAGE } from "../../shared/files.ts"
import { asFilePath, type FilePath } from "../../shared/ids.ts"
import { AttachmentError } from "../attachments/AttachmentError.ts"
import { existingPath } from "../attachments/paths.ts"

const prepareFile = (raw: string, home: string): Effect.Effect<FilePath, AttachmentError> =>
  existingPath(raw, home).pipe(
    Effect.map((found) => found.path),
    Effect.mapError(() => new AttachmentError(`${fileName(asFilePath(raw))} is no longer available.`)),
  )

// Existing files and folders, normalized
export const prepareFiles = (raw: ReadonlyArray<string>, home: string): Effect.Effect<ReadonlyArray<FilePath>, AttachmentError> =>
  raw.length > MAX_FILES
    ? Effect.fail(new AttachmentError(TOO_MANY_FILES_MESSAGE))
    : Effect.forEach(raw, (p) => prepareFile(p, home))
