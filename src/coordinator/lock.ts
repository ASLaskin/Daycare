// Single-instance ownership through a kernel-held flock.

import { dlopen, FFIType, read } from "bun:ffi"
import { closeSync, ftruncateSync, openSync, writeSync } from "node:fs"
import type { FilePath } from "../shared/ids.ts"

const LOCK_EX = 2
const LOCK_NB = 4
const flock = { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } as const
const errnoPointer = { args: [], returns: FFIType.ptr } as const

const libc = () => {
  switch (process.platform) {
    case "linux": {
      const c = dlopen("libc.so.6", { flock, __errno_location: errnoPointer }).symbols
      return { flock: c.flock, errno: () => read.i32(c.__errno_location()!), wouldBlock: 11 }
    }
    case "darwin": {
      const c = dlopen("libSystem.B.dylib", { flock, __error: errnoPointer }).symbols
      return { flock: c.flock, errno: () => read.i32(c.__error()!), wouldBlock: 35 }
    }
    default:
      throw new Error(`the coordinator lock does not support ${process.platform}`)
  }
}

// Null when another process holds it
export const takeLock = (file: FilePath): { readonly release: () => void } | null => {
  const c = libc()
  const fd = openSync(file, "a", 0o600)
  if (c.flock(fd, LOCK_EX | LOCK_NB) === 0) {
    // Records the pid for clients
    ftruncateSync(fd, 0)
    writeSync(fd, `${process.pid}\n`)
    let held = true
    // Closes at most once
    return {
      release: () => {
        if (held) {
          held = false
          closeSync(fd)
        }
      },
    }
  }
  const errno = c.errno()
  closeSync(fd)
  if (errno === c.wouldBlock) {
    return null
  }
  throw new Error(`flock ${file}: errno ${errno}`)
}
