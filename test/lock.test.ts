// Kernel-held single-instance lock on Linux.

import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { takeLock } from "../src/coordinator/lock.ts"
import { asFilePath } from "../src/shared/ids.ts"

const dir = mkdtempSync(path.join(tmpdir(), "daycare-lock-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const lockFile = (name: string) => asFilePath(path.join(dir, name))

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("a second holder is refused until the first releases", () => {
  const file = lockFile("a.lock")
  const first = takeLock(file)
  expect(first).not.toBeNull()
  expect(takeLock(file)).toBeNull()
  first?.release()
  const again = takeLock(file)
  expect(again).not.toBeNull()
  again?.release()
})

test("releasing twice closes the lock only once", () => {
  const lock = takeLock(lockFile("c.lock"))
  lock?.release()
  expect(() => lock?.release()).not.toThrow()
})

test("SIGKILL frees the lock even while the holder's child lives", async () => {
  const file = lockFile("b.lock")
  const script = `
    import { takeLock } from ${JSON.stringify(path.resolve("src/coordinator/lock.ts"))}
    if (!takeLock(${JSON.stringify(file)})) process.exit(3)
    const child = Bun.spawn(["sleep", "30"])
    console.log(child.pid)
    await Bun.sleep(30000)
  `
  const holder = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe" })
  const reader = holder.stdout.getReader()
  const { value } = await reader.read()
  const child = Number(new TextDecoder().decode(value).trim())
  expect(takeLock(file)).toBeNull()

  holder.kill("SIGKILL")
  await holder.exited
  expect(alive(child)).toBe(true)
  const after = takeLock(file)
  process.kill(child, "SIGKILL")
  expect(after).not.toBeNull()
  after?.release()
})
