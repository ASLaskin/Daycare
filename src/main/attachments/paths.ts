// Mentioned paths checked against the disk.

import { Effect } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import type { ResolvedPath, ResolveRequest } from "../../shared/attachments.ts"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"
import { AttachmentError } from "./AttachmentError.ts"

const MAX_PATHS = 200
const MAX_PATH_LENGTH = 4096

export interface ExistingPath {
  readonly path: FilePath
  readonly isDir: boolean
}

export const expandHome = (p: string, home: string): string => {
  if (p === "~") {
    return home
  }
  return p.startsWith("~/") ? path.join(home, p.slice(2)) : p
}

const usable = (raw: string) => raw.length > 0 && raw.length <= MAX_PATH_LENGTH && !raw.includes("\0")

const statOf = (p: string) =>
  Effect.tryPromise({ try: () => fs.stat(p), catch: () => new AttachmentError("Path not found") })

// Existing file or folder at an absolute path
export const existingPath = (raw: string, home: string): Effect.Effect<ExistingPath, AttachmentError> =>
  Effect.gen(function* () {
    const expanded = usable(raw) ? expandHome(raw, home) : ""
    if (!path.isAbsolute(expanded)) {
      return yield* Effect.fail(new AttachmentError("Not an absolute path"))
    }
    const normalized = path.normalize(expanded).replace(/(.)\/+$/, "$1")
    const stat = yield* statOf(normalized)
    if (!stat.isFile() && !stat.isDirectory()) {
      return yield* Effect.fail(new AttachmentError("Not a file or folder"))
    }
    return { path: asFilePath(normalized), isDir: stat.isDirectory() }
  })

const resolveOne = (raw: string, cwd: DirPath, home: string): Effect.Effect<ReadonlyArray<ResolvedPath>> => {
  const expanded = usable(raw) ? expandHome(raw, home) : ""
  const absolute = expanded && (path.isAbsolute(expanded) ? expanded : path.join(cwd, expanded))
  return existingPath(absolute, home).pipe(
    Effect.map((found): ReadonlyArray<ResolvedPath> => [{ raw, ...found }]),
    Effect.orElseSucceed(() => []),
  )
}

// Mentioned paths that exist, relative ones read against cwd
export const resolveMentions = (req: ResolveRequest, home: string): Effect.Effect<ReadonlyArray<ResolvedPath>> => {
  if (!path.isAbsolute(req.cwd)) {
    return Effect.succeed([])
  }
  const paths = [...new Set(req.paths)].slice(0, MAX_PATHS)
  return Effect.forEach(paths, (raw) => resolveOne(raw, req.cwd, home), { concurrency: 16 }).pipe(Effect.map((all) => all.flat()))
}
