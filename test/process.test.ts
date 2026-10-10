// Provider process groups: stopping a provider also ends what it left running.

import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { spawnGroup, stopGroup } from "../src/coordinator/process.ts"

// Running, not merely a zombie awaiting its reaper
const alive = (pid: number) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] !== "Z"
  } catch {
    return false
  }
}

const descendantOf = async (child: ReturnType<typeof spawnGroup>) => {
  const { value } = await child.stdout[Symbol.asyncIterator]().next()
  return Number(String(value).trim())
}

const until = async (check: () => boolean) => {
  const deadline = Date.now() + 2000
  while (!check() && Date.now() < deadline) {
    await Bun.sleep(20)
  }
  return check()
}

test("stopping kills descendants left in the group", async () => {
  const child = spawnGroup("/bin/sh", ["-c", "sleep 300 & echo $!; exec cat"], { env: process.env })
  const descendant = await descendantOf(child)
  expect(alive(descendant)).toBe(true)
  child.stdin.end()
  await stopGroup(child)
  expect(await until(() => !alive(descendant))).toBe(true)
})

test("a leader that ignores stdin is killed after the grace", async () => {
  const child = spawnGroup("/bin/sh", ["-c", "trap '' TERM; sleep 300 & echo $!; wait"], { env: process.env })
  const descendant = await descendantOf(child)
  const started = Date.now()
  await stopGroup(child, 200)
  expect(Date.now() - started).toBeGreaterThanOrEqual(200)
  expect(await until(() => !alive(descendant) && !alive(child.pid ?? 0))).toBe(true)
})
