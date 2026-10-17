// claude auth login runs, at most one per account.

import { type ChildProcess, spawn } from "node:child_process"
import type { LoginProgress } from "../../shared/accounts.ts"
import type { AccountId, FilePath } from "../../shared/ids.ts"
import { lastLine, loginUrl } from "./auth.ts"

export interface Logins {
  readonly start: (id: AccountId, env: NodeJS.ProcessEnv) => void
  // Code pasted from the browser when the redirect fails
  readonly submitCode: (id: AccountId, code: string) => void
  readonly cancel: (id: AccountId) => void
  readonly cancelAll: () => void
}

export const makeLogins = (claude: FilePath, report: (p: LoginProgress) => void): Logins => {
  const runs = new Map<AccountId, ChildProcess>()

  const finish = (id: AccountId, child: ChildProcess, ok: boolean, output: string) => {
    if (runs.get(id) !== child) {
      return
    }
    runs.delete(id)
    report({ id, phase: ok ? "done" : "failed", url: null, message: ok ? "Signed in" : lastLine(output) || "Sign in failed" })
  }

  const start = (id: AccountId, env: NodeJS.ProcessEnv) => {
    cancel(id)
    const child = spawn(claude, ["auth", "login"], { env, stdio: ["pipe", "pipe", "pipe"] })
    runs.set(id, child)
    let output = ""
    let url: string | null = null
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8")
      const found = loginUrl(output)
      if (found && found !== url && runs.get(id) === child) {
        url = found
        report({ id, phase: "waiting", url, message: "Finish signing in in your browser" })
      }
    }
    child.stdout?.on("data", onData)
    child.stderr?.on("data", onData)
    child.on("error", (err) => finish(id, child, false, String(err)))
    child.on("exit", (code) => finish(id, child, code === 0, output))
    report({ id, phase: "waiting", url: null, message: "Opening your browser" })
  }

  const submitCode = (id: AccountId, code: string) => {
    const stdin = runs.get(id)?.stdin
    if (stdin?.writable && code.trim()) {
      stdin.write(`${code.trim()}\n`)
    }
  }

  const cancel = (id: AccountId) => {
    const child = runs.get(id)
    runs.delete(id)
    child?.kill()
  }

  const cancelAll = () => [...runs.keys()].forEach(cancel)

  return { start, submitCode, cancel, cancelAll }
}
