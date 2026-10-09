// Coordinator locations per platform and the login shell's answers.

import { expect, test } from "bun:test"
import { unitFile } from "../src/main/coordinator/launch.ts"
import { databasePath, parseLogin, scriptPath } from "../src/main/coordinator/paths.ts"
import { asDirPath, asFilePath } from "../src/shared/ids.ts"
import { runtimeDir } from "../src/shared/runtime.ts"

const home = asDirPath("/home/u")

test("the database survives reboots: XDG state on Linux, Application Support on macOS", () => {
  expect(databasePath("linux", {}, home)).toBe(asFilePath("/home/u/.local/state/daycare/coordinator.db"))
  expect(databasePath("linux", { XDG_STATE_HOME: "/data/state" }, home)).toBe(asFilePath("/data/state/daycare/coordinator.db"))
  expect(databasePath("darwin", { XDG_STATE_HOME: "/ignored" }, home)).toBe(asFilePath("/home/u/Library/Application Support/Daycare/coordinator.db"))
})

test("the packaged app runs the unpacked coordinator", () => {
  expect(scriptPath(asDirPath("/Applications/Daycare.app/Contents/Resources/app.asar"))).toBe(asFilePath("/Applications/Daycare.app/Contents/Resources/app.asar.unpacked/dist/coordinator/main.js"))
  expect(scriptPath(asDirPath("/home/u/projects/Daycare"))).toBe(asFilePath("/home/u/projects/Daycare/dist/coordinator/main.js"))
})

test("login output keeps found names and drops missing ones", () => {
  expect(parseLogin("PATH=/a:/b\nbun=/x/bun\nclaude=\ncodex=/y/codex=1\nnoise\n")).toEqual({ PATH: "/a:/b", bun: "/x/bun", codex: "/y/codex=1" })
})

test("the runtime directory: override, XDG on Linux, the per-user temp folder on macOS", () => {
  expect(runtimeDir({ DAYCARE_RUNTIME_DIR: "/r", XDG_RUNTIME_DIR: "/x" }, "linux")).toBe("/r")
  expect(runtimeDir({ XDG_RUNTIME_DIR: "/run/user/1000" }, "linux")).toBe("/run/user/1000/daycare")
  expect(runtimeDir({}, "darwin", "/var/folders/ab/cd/T")).toBe("/var/folders/ab/cd/T/daycare")
  expect(() => runtimeDir({}, "linux")).toThrow("XDG_RUNTIME_DIR or DAYCARE_RUNTIME_DIR must be set")
})

test("the generated unit quotes paths, escapes systemd specifiers and never retries a lockout", () => {
  const text = unitFile({
    bun: asFilePath("/opt/my bun/bun"),
    script: asFilePath("/home/u/Daycare/dist/coordinator/main.js"),
    env: { DAYCARE_DB: "/home/u/100% state/coordinator.db", PATH: "/a:/b" },
  })
  expect(text).toContain('ExecStart="/opt/my bun/bun" "/home/u/Daycare/dist/coordinator/main.js"')
  expect(text).toContain('Environment="DAYCARE_DB=/home/u/100%% state/coordinator.db"')
  expect(text).toContain('Environment="PATH=/a:/b"')
  expect(text).toContain("RestartPreventExitStatus=3")
})
