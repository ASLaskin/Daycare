// Where the coordinator, its database and the executables it runs live.

import { execFileSync } from "node:child_process"
import path from "node:path"
import { asFilePath, type DirPath, type FilePath } from "../../shared/ids.ts"

export interface CoordinatorSetup {
  readonly bun: FilePath
  readonly script: FilePath
  // Environment the coordinator runs with
  readonly env: Readonly<Record<string, string>>
}

// Survives reboots: XDG state on Linux, Application Support on macOS
export const databasePath = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: DirPath): FilePath =>
  asFilePath(
    platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Daycare", "coordinator.db")
      : path.join(env["XDG_STATE_HOME"] || path.join(home, ".local", "state"), "daycare", "coordinator.db"),
  )

// Unpacked coordinator, readable by Bun
export const scriptPath = (appRoot: DirPath): FilePath =>
  asFilePath(path.join(appRoot.replace(/app\.asar$/, "app.asar.unpacked"), "dist", "coordinator", "main.js"))

const MARK = "DAYCARE:"

// Marked name=value lines only
export const parseLogin = (out: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    out.split("\n").flatMap((line) => {
      const marked = line.startsWith(MARK) ? line.slice(MARK.length) : ""
      const i = marked.indexOf("=")
      return i > 0 && marked.slice(i + 1) ? [[marked.slice(0, i), marked.slice(i + 1)]] : []
    }),
  )

// PATH and executables from the login shell
const loginShell = () => {
  const script = `printf '${MARK}PATH=%s\\n' "$PATH"; for n in bun claude codex; do printf '${MARK}%s=%s\\n' "$n" "$(command -v $n)"; done`
  try {
    return parseLogin(execFileSync(process.env["SHELL"] || "/bin/zsh", ["-ilc", script], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }))
  } catch {
    return {}
  }
}

export const coordinatorSetup = (appRoot: DirPath, home: DirPath): CoordinatorSetup => {
  const found = loginShell()
  const pick = (name: string) => process.env[`DAYCARE_${name.toUpperCase()}`] || found[name]
  const bun = pick("bun")
  if (!bun) {
    throw new Error("bun was not found on the login PATH; install it or set DAYCARE_BUN")
  }
  const claude = pick("claude")
  const codex = pick("codex")
  const runtime = process.env["DAYCARE_RUNTIME_DIR"]
  return {
    bun: asFilePath(bun),
    script: scriptPath(appRoot),
    env: {
      PATH: found["PATH"] || process.env["PATH"] || "",
      DAYCARE_DB: databasePath(process.platform, process.env, home),
      ...(claude ? { DAYCARE_CLAUDE: claude } : {}),
      ...(codex ? { DAYCARE_CODEX: codex } : {}),
      ...(runtime ? { DAYCARE_RUNTIME_DIR: runtime } : {}),
    },
  }
}
