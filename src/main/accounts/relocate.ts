// Copies a session transcript into another account's config dir.

import fs from "node:fs"
import path from "node:path"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"

// Same relative path under another config dir, or null when outside fromDir
export const relocatedPath = (transcript: FilePath, fromDir: DirPath, toDir: DirPath): FilePath | null => {
  const rel = path.relative(fromDir, transcript)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null
  }
  return asFilePath(path.join(toDir, rel))
}

// Subagent transcripts folder next to a transcript
const sidecarOf = (transcript: string) => transcript.replace(/\.jsonl$/, "")

// Copied transcript path, or null when there is nothing to copy
export const copyTranscript = (transcript: FilePath, fromDir: DirPath, toDir: DirPath): FilePath | null => {
  const target = relocatedPath(transcript, fromDir, toDir)
  if (!target || !fs.existsSync(transcript)) {
    return null
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(transcript, target)
  const sidecar = sidecarOf(transcript)
  if (sidecar !== transcript && fs.existsSync(sidecar)) {
    fs.cpSync(sidecar, sidecarOf(target), { recursive: true, force: true })
  }
  return target
}
