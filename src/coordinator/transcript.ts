// Claude transcripts across account config dirs.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { copyTranscript } from "../main/accounts/relocate.ts"
import type { NativeId } from "../shared/coordinator.ts"
import { asDirPath, asFilePath, type DirPath, type FilePath } from "../shared/ids.ts"

// Folder Claude Code reads; null is ~/.claude
const configHome = (configDir: DirPath | null): DirPath => configDir ?? asDirPath(path.join(os.homedir(), ".claude"))

// Transcript of a native session in any project folder
export const findTranscript = (configDir: DirPath | null, nativeId: NativeId): FilePath | null => {
  const projects = path.join(configHome(configDir), "projects")
  const folders = fs.existsSync(projects) ? fs.readdirSync(projects) : []
  return folders.map((f) => asFilePath(path.join(projects, f, `${nativeId}.jsonl`))).find((t) => fs.existsSync(t)) ?? null
}

// False when there was no transcript or it could not be copied
export const carryTranscript = (nativeId: NativeId, from: DirPath | null, to: DirPath | null): boolean => {
  const transcript = findTranscript(from, nativeId)
  if (!transcript) {
    return false
  }
  try {
    return copyTranscript(transcript, configHome(from), configHome(to)) !== null
  } catch {
    return false
  }
}
