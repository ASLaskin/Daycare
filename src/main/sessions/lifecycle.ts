// Starting, stopping, creating and removing sessions.

import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { asClaudeSessionId, asDirPath, asSessionId } from "../../shared/ids.ts"
import type { SessionRecord } from "../../shared/session.ts"
import type { Core } from "./core.ts"
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

export const makeLifecycle = (core: Core): Lifecycle => {
  const { sessions, deps, run } = core
  const { chat, endpoint, ui, settings, usage } = deps

  const childEnv = () => ({
    ...cleanEnv(process.env),
    DAYCARE_TOKEN: endpoint.token,
    MCP_TOOL_TIMEOUT: String(MCP_TIMEOUT_MS),
  })

  const sendText = (s: Session, text: string) => {
    s.hadTurn = true
    run(chat.send(s.id, text))
  }

  const startSession = (s: Session, resume: boolean) => {
    const args = claudeArgs(s, resume, core.mcpDir, endpoint, { oogaBooga: run(settings.get).oogaBooga })
    const dir = fs.existsSync(s.cwd) ? s.cwd : asDirPath(os.homedir())
    run(chat.start({ id: s.id, cwd: dir, env: childEnv(), args, transcriptPath: resume && canResume(s) ? s.transcriptPath : null }))
    if (s.task && !resume) {
      sendText(s, s.task)
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

  const killSession = (s: Session) => run(chat.stop(s.id))

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
      closing: false,
    }
    sessions.set(s.id, s)
    ui.send("session:created", view(s))
    core.persist()
    if (s.status !== "closed") {
      startSession(s, !!restored)
    }
    return s
  }

  // Send text like a user
  const submitText = (s: Session, text: string) => {
    if (!run(chat.has(s.id))) {
      return false
    }
    sendText(s, text)
    return true
  }

  return { createSession, startSession, killSession, sessionExited, removeSession, submitText }
}
