// Starting, stopping, creating and removing sessions.

import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { asClaudeSessionId, asDirPath, asSessionId, type ClaudeSessionId, type DirPath } from "../../shared/ids.ts"
import type { SessionRecord } from "../../shared/session.ts"
import type { PtyProcess } from "./Pty.ts"
import { type Core, later } from "./core.ts"
import { cleanEnv } from "./env.ts"
import { claudeArgs, MCP_TIMEOUT_MS } from "./launch.ts"
import { canResume, type CreateOptions, type Session, view } from "./model.ts"
import { defaultMasterName, nextIcon } from "./naming.ts"
import { contextTokens, firstLine, lastAssistantText } from "./transcripts.ts"

export interface Lifecycle {
  readonly createSession: (options: CreateOptions, restored?: SessionRecord | null) => Session
  readonly startSession: (s: Session, resume: boolean) => void
  readonly killSession: (s: Session) => void
  readonly sessionExited: (s: Session) => void
  readonly removeSession: (s: Session) => void
  readonly submitText: (s: Session, text: string) => boolean
}

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const SUBMIT_DELAY_MS = 120

const shellNotice = (claudeSessionId: ClaudeSessionId) =>
  `\r\n\x1b[2mClaude exited. Run claude --resume ${claudeSessionId} to pick it back up.\x1b[0m\r\n`

export const makeLifecycle = (core: Core): Lifecycle => {
  const { sessions, deps, run } = core
  const { chat, pty, claude, endpoint, ui, settings, usage } = deps

  const childEnv = () => ({
    ...cleanEnv(process.env),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    DAYCARE_TOKEN: endpoint.token,
    MCP_TOOL_TIMEOUT: String(MCP_TIMEOUT_MS),
  })

  const startChat = (s: Session, resume: boolean, dir: DirPath, args: ReadonlyArray<string>) => {
    run(chat.start({ id: s.id, cwd: dir, env: childEnv(), args, transcriptPath: resume && canResume(s) ? s.transcriptPath : null }))
    if (s.task && !resume) {
      run(chat.send(s.id, s.task))
    }
  }

  const startTerminal = (s: Session, dir: DirPath, args: ReadonlyArray<string>) => {
    const env = childEnv()
    const proc = pty.spawn(claude.path, args, { cols: s.cols, rows: s.rows, cwd: dir, env })
    s.proc = proc
    proc.onData((data) => ui.send("pty:data", { id: s.id, data }))
    proc.onExit(() => {
      if (s.proc !== proc) {
        return
      }
      s.proc = null
      // Quitting claude drops to a shell
      if (!s.closing && !core.isQuitting() && sessions.get(s.id) === s) {
        startShell(s, dir, env)
        return
      }
      sessionExited(s)
    })
  }

  const startSession = (s: Session, resume: boolean) => {
    s.shell = false
    const args = claudeArgs(s, resume, core.mcpDir, endpoint)
    const dir = fs.existsSync(s.cwd) ? s.cwd : asDirPath(os.homedir())
    if (s.kind === "chat") {
      startChat(s, resume, dir, args)
    } else {
      startTerminal(s, dir, args)
    }
    // Initial status for sessions with no prompt yet
    if (resume || !s.task) {
      if (resume) {
        s.lastMessage = lastAssistantText(s.transcriptPath) || s.lastMessage
      }
      core.setStatus(s, s.hadTurn || s.lastMessage ? "done" : "idle", firstLine(s.lastMessage))
    }
    core.syncPower()
  }

  // Login shell left in the pane after claude exits
  const startShell = (s: Session, dir: DirPath, env: NodeJS.ProcessEnv) => {
    let proc: PtyProcess
    try {
      proc = pty.spawn(process.env["SHELL"] || "/bin/zsh", ["-l"], { cols: s.cols, rows: s.rows, cwd: dir, env })
    } catch {
      return sessionExited(s)
    }
    s.proc = proc
    s.shell = true
    ui.send("pty:data", { id: s.id, data: shellNotice(s.claudeSessionId) })
    proc.onData((data) => ui.send("pty:data", { id: s.id, data }))
    proc.onExit(() => {
      if (s.proc !== proc) {
        return
      }
      s.proc = null
      sessionExited(s)
    })
    core.setStatus(s, "exited", "shell")
  }

  const killSession = (s: Session) => {
    if (s.kind === "chat") {
      run(chat.stop(s.id))
      return
    }
    s.proc?.kill()
  }

  // Closed sessions stay listed, others are removed
  const sessionExited = (s: Session) => {
    if (core.isQuitting()) {
      return
    }
    if (!s.closing) {
      return removeSession(s)
    }
    s.closing = false
    s.status = "closed"
    s.activity = ""
    core.update(s)
    core.flushWaiters()
    core.persist()
    core.syncPower()
    core.runBackground(usage.refresh())
  }

  // Remove a session and its workers, keeping transcripts
  const removeSession = (s: Session) => {
    if (!sessions.has(s.id)) {
      return
    }
    if (s.role === "master") {
      core.childrenOf(s.id).forEach((w) => {
        killSession(w)
        removeSession(w)
      })
      fs.rmSync(path.join(core.mcpDir, `${s.id}.json`), { force: true })
    }
    sessions.delete(s.id)
    ui.send("session:removed", { id: s.id, parentId: s.parentId })
    core.flushWaiters()
    core.persist()
    core.syncPower()
  }

  const iconFor = (options: CreateOptions, restored: SessionRecord | null) => {
    if (restored) {
      return restored.icon
    }
    if (options.role !== "master") {
      return null
    }
    const used = [...sessions.values()].filter((x) => x.role === "master").map((x) => x.icon)
    return nextIcon(new Set(used))
  }

  const nameFor = (options: CreateOptions) => {
    if (options.name) {
      return options.name
    }
    if (options.role !== "master") {
      return "Worker"
    }
    const current = run(settings.get)
    return defaultMasterName({
      cwd: options.cwd,
      taken: new Set([...sessions.values()].map((x) => x.name)),
      randomNames: current.randomNames,
      locationLabel: current.locations.find((l) => l.path === options.cwd)?.label,
    })
  }

  const createSession = (options: CreateOptions, restored: SessionRecord | null = null): Session => {
    const s: Session = {
      id: restored?.id ?? asSessionId(randomUUID()),
      role: options.role,
      kind: options.kind,
      parentId: options.parentId ?? null,
      cwd: options.cwd,
      model: options.model,
      permissionMode: options.permissionMode,
      createdAt: restored?.createdAt ?? Date.now(),
      icon: iconFor(options, restored),
      name: nameFor(options),
      task: restored ? null : (options.task ?? null),
      status: restored?.closed ? "closed" : "starting",
      activity: "",
      transcriptPath: restored?.transcriptPath ?? null,
      claudeSessionId: restored?.claudeSessionId ?? asClaudeSessionId(randomUUID()),
      lastMessage: "",
      finishedTurns: 0,
      hadTurn: restored?.hadTurn ?? false,
      context: restored ? contextTokens(restored.transcriptPath) : 0,
      proc: null,
      shell: false,
      closing: false,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    }
    sessions.set(s.id, s)
    ui.send("session:created", view(s))
    core.persist()
    if (s.status !== "closed") {
      startSession(s, !!restored)
    }
    return s
  }

  // Paste and submit text like a user
  const submitText = (s: Session, text: string) => {
    if (s.kind === "chat") {
      if (!run(chat.has(s.id))) {
        return false
      }
      run(chat.send(s.id, text))
      return true
    }
    const proc = s.proc
    if (!proc || s.shell) {
      return false
    }
    proc.write(`\x1b[200~${text}\x1b[201~`)
    later(SUBMIT_DELAY_MS, () => s.proc === proc && proc.write("\r"))
    return true
  }

  return { createSession, startSession, killSession, sessionExited, removeSession, submitText }
}
