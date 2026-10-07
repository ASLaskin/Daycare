// Single-instance ownership through a kernel-held flock.

import { dlopen, FFIType, read } from "bun:ffi"
import { closeSync, openSync } from "node:fs"
import type { FilePath } from "../shared/ids.ts"

const LOCK_EX = 2
const LOCK_NB = 4
const EWOULDBLOCK = 11

// ponytail: glibc symbols, verified on Linux only; macOS needs libSystem and __error
const libc = () => {
  if (process.platform !== "linux") {
    throw new Error(`the coordinator lock is not verified on ${process.platform}`)
  }
  return dlopen("libc.so.6", {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  }).symbols
}

// Held until release or process death; null when another process holds it
export const takeLock = (file: FilePath): { readonly release: () => void } | null => {
  const c = libc()
  const fd = openSync(file, "a", 0o600)
  if (c.flock(fd, LOCK_EX | LOCK_NB) === 0) {
    let held = true
    // Closes once; a reused fd number must never be closed again
    return {
      release: () => {
        if (held) {
          held = false
          closeSync(fd)
        }
      },
    }
  }
  const errno = read.i32(c.__errno_location()!)
  closeSync(fd)
  if (errno === EWOULDBLOCK) {
    return null
  }
  throw new Error(`flock ${file}: errno ${errno}`)
}
