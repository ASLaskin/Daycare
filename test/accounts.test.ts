// Account helpers: settings, config dirs, auth output, transcript moves.

import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { lastLine, loginUrl, parseAuthStatus } from "../src/main/accounts/auth.ts"
import { removeDialog, switchChoice, switchDialog } from "../src/main/accounts/dialogs.ts"
import { keychainService } from "../src/main/accounts/keychain.ts"
import { CONFIG_ENV, configDirFor, configHomeFor, withConfigDir } from "../src/main/accounts/paths.ts"
import { copyTranscript, relocatedPath } from "../src/main/accounts/relocate.ts"
import { linkSharedConfig } from "../src/main/accounts/shared-config.ts"
import { accountLabel, activeAccountOf, allAccounts, DEFAULT_ACCOUNT, uniqueLabel } from "../src/shared/accounts.ts"
import { asAccountId, asDirPath, asFilePath } from "../src/shared/ids.ts"
import { baseSettings, mergeSettings, type Settings } from "../src/shared/settings.ts"

const work = { id: asAccountId("w1"), label: "Work" }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "daycare-accounts-"))

describe("account list", () => {
  test("Default always comes first and is never duplicated", () => {
    expect(allAccounts([work]).map((a) => a.label)).toEqual(["Default", "Work"])
    expect(allAccounts([{ id: DEFAULT_ACCOUNT, label: "Fake" }]).map((a) => a.label)).toEqual(["Default"])
  })

  test("a removed active account falls back to Default", () => {
    expect(activeAccountOf({ accounts: [work], activeAccount: work.id })).toBe(work.id)
    expect(activeAccountOf({ accounts: [], activeAccount: work.id })).toBe(DEFAULT_ACCOUNT)
    expect(accountLabel([], work.id)).toBe("Default")
  })

  test("labels are trimmed and made unique", () => {
    expect(uniqueLabel([work], "  Personal ")).toBe("Personal")
    expect(uniqueLabel([work], "work")).toBe("work 2")
    expect(uniqueLabel([work, { id: asAccountId("w2"), label: "Work 2" }], "Work")).toBe("Work 3")
    expect(uniqueLabel([], " ")).toBe("Account")
  })

  test("settings keep valid accounts and default to Default", () => {
    const defaults: Settings = { ...baseSettings, locations: [] }
    expect(defaults.activeAccount).toBe(DEFAULT_ACCOUNT)
    const merged = mergeSettings(defaults, { accounts: [{ id: "w1", label: "Work" }], activeAccount: "w1" })
    expect([merged.accounts, merged.activeAccount]).toEqual([[work], work.id])
    expect(mergeSettings(defaults, { accounts: [{ id: 3 }] }).accounts).toEqual([])
  })
})

describe("config dirs", () => {
  test("Default uses ~/.claude, others their own folder under userData", () => {
    expect(configDirFor("/data", DEFAULT_ACCOUNT)).toBeNull()
    expect(configDirFor("/data", work.id)).toBe(asDirPath("/data/accounts/w1"))
    expect(configDirFor("/data", asAccountId("../../etc"))).toBe(asDirPath("/data/accounts/etc"))
    expect(configHomeFor("/home", "/data", DEFAULT_ACCOUNT)).toBe(asDirPath("/home/.claude"))
  })

  test("child env sets or clears CLAUDE_CONFIG_DIR", () => {
    const base = { PATH: "/bin", [CONFIG_ENV]: "/elsewhere" }
    expect(withConfigDir(base, asDirPath("/data/accounts/w1"))).toEqual({ PATH: "/bin", [CONFIG_ENV]: "/data/accounts/w1" })
    expect(withConfigDir(base, null)).toEqual({ PATH: "/bin" })
  })

  test("keychain item matches Claude Code's naming", () => {
    expect(keychainService(null)).toBe("Claude Code-credentials")
    expect(keychainService(asDirPath("/Users/me/Library/Application Support/Daycare/accounts/abc"))).toBe("Claude Code-credentials-dd50e7a6")
  })

  test("shared personal config is linked once, credentials are not", () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, ".claude", "skills"), { recursive: true })
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "rules")
    fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), "{}")
    const dir = asDirPath(path.join(home, "acct"))
    linkSharedConfig(home, dir)
    linkSharedConfig(home, dir)
    expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toBe("rules")
    expect(fs.lstatSync(path.join(dir, "skills")).isSymbolicLink()).toBe(true)
    expect(fs.existsSync(path.join(dir, ".credentials.json"))).toBe(false)
    expect(fs.existsSync(path.join(dir, "agents"))).toBe(false)
  })
})

describe("auth output", () => {
  test("status JSON, including the logged out shape", () => {
    expect(parseAuthStatus('{"loggedIn":true,"email":"a@b.c"}')).toEqual({ loggedIn: true, email: "a@b.c" })
    expect(parseAuthStatus('{"loggedIn":false,"authMethod":"none"}')).toEqual({ loggedIn: false, email: null })
    expect(parseAuthStatus("garbage")).toEqual({ loggedIn: false, email: null })
  })

  test("login link inside an OSC 8 hyperlink", () => {
    const url = "https://claude.com/cai/oauth/authorize?code=true&state=x"
    const out = `Opening browser to sign in…\nIf the browser didn't open, visit: \x1b]8;;${url}\x07${url}\x1b]8;;\x07\nPaste code here if prompted > `
    expect(loginUrl(out)).toBe(url)
    expect(loginUrl("nothing yet")).toBeNull()
    expect(lastLine(`\x1b[31mLogin failed: denied\x1b[0m\n\n`)).toBe("Login failed: denied")
  })
})

describe("transcript moves", () => {
  test("maps a path under one config dir to another", () => {
    const from = asDirPath("/home/.claude")
    const to = asDirPath("/data/accounts/w1")
    expect(relocatedPath(asFilePath("/home/.claude/projects/-x/a.jsonl"), from, to)).toBe(asFilePath("/data/accounts/w1/projects/-x/a.jsonl"))
    expect(relocatedPath(asFilePath("/other/a.jsonl"), from, to)).toBeNull()
  })

  test("copies the transcript and its subagent folder, overwriting stale copies", () => {
    const root = tmp()
    const from = asDirPath(path.join(root, "a"))
    const to = asDirPath(path.join(root, "b"))
    const src = path.join(from, "projects", "-x", "s.jsonl")
    fs.mkdirSync(path.join(from, "projects", "-x", "s", "subagents"), { recursive: true })
    fs.writeFileSync(path.join(from, "projects", "-x", "s", "subagents", "agent.jsonl"), "sub")
    fs.writeFileSync(src, "new")
    fs.mkdirSync(path.join(to, "projects", "-x"), { recursive: true })
    fs.writeFileSync(path.join(to, "projects", "-x", "s.jsonl"), "old")
    const target = copyTranscript(asFilePath(src), from, to)
    expect(target).toBe(asFilePath(path.join(to, "projects", "-x", "s.jsonl")))
    expect(fs.readFileSync(target!, "utf8")).toBe("new")
    expect(fs.readFileSync(path.join(to, "projects", "-x", "s", "subagents", "agent.jsonl"), "utf8")).toBe("sub")
    expect(copyTranscript(asFilePath(path.join(from, "missing.jsonl")), from, to)).toBeNull()
  })
})

describe("dialogs", () => {
  test("switch buttons map to choices, anything else cancels", () => {
    const d = switchDialog(2, "Work")
    expect(d.buttons).toEqual(["Keep running sessions", "Restart on Work", "Cancel"])
    expect(d.buttons[d.defaultId]).toBe("Keep running sessions")
    expect([0, 1, 2, 7].map(switchChoice)).toEqual(["keep", "restart", "cancel", "cancel"])
    expect(d.detail).toContain("2 sessions are running")
  })

  test("removal mentions closed sessions moving to Default", () => {
    expect(removeDialog("Work", 1).detail).toContain("1 closed session moves to Default")
    expect(removeDialog("Work", 0).detail).not.toContain("Default")
  })
})
