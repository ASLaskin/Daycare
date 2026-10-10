// Coordinator locations per platform and the login shell's answers.

import { expect, test } from "bun:test"
import { unitFile } from "../src/main/coordinator/launch.ts"
import { parseLogin } from "../src/main/coordinator/paths.ts"
import { asFilePath } from "../src/shared/ids.ts"

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
