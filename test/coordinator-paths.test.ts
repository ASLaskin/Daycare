// Coordinator locations, supervisor files and the login shell's answers.

import { expect, test } from "bun:test"
import { agentFile, LABEL } from "../src/main/coordinator/launchd.ts"
import { parseLogin } from "../src/main/coordinator/paths.ts"
import { unitFile } from "../src/main/coordinator/systemd.ts"
import { legacyKeepAwake } from "../src/main/power/legacy.ts"
import { asDirPath, asFilePath } from "../src/shared/ids.ts"

test("login output keeps marked names, drops missing ones and ignores startup noise", () => {
  const out = "Welcome!\nPATH=/not/marked\nDAYCARE:PATH=/a:/b\nDAYCARE:bun=/x/bun\nDAYCARE:claude=\nDAYCARE:codex=/y/codex=1\n"
  expect(parseLogin(out)).toEqual({ PATH: "/a:/b", bun: "/x/bun", codex: "/y/codex=1" })
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

test("the launch agent starts at login, restarts after crashes and escapes its values", () => {
  const text = agentFile(
    { bun: asFilePath("/opt/b&b/bun"), script: asFilePath("/Apps/Daycare.app/main.js"), env: { DAYCARE_DB: "/u/<db>", PATH: "/a:/b" } },
    asDirPath("/Users/u"),
  )
  expect(text).toContain(`<key>Label</key><string>${LABEL}</string>`)
  expect(text).toContain("<array><string>/opt/b&amp;b/bun</string><string>/Apps/Daycare.app/main.js</string></array>")
  expect(text).toContain("<key>DAYCARE_DB</key><string>/u/&lt;db&gt;</string>")
  expect(text).toContain("<key>RunAtLoad</key><true/>")
  expect(text).toContain("<dict><key>SuccessfulExit</key><false/></dict>")
  expect(text).toContain("<string>/Users/u/Library/Logs/Daycare/coordinator.log</string>")
})

test("the old keep awake setting is read once from raw settings", () => {
  expect(legacyKeepAwake(() => JSON.stringify({ keepAwake: "always" }))).toBe("always")
  expect(legacyKeepAwake(() => JSON.stringify({ keepAwake: "sometimes" }))).toBeNull()
  expect(legacyKeepAwake(() => "{}")).toBeNull()
  expect(
    legacyKeepAwake(() => {
      throw new Error("missing")
    }),
  ).toBeNull()
})
