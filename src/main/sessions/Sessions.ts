// Every Claude Code session the app owns: masters and their workers, each one a
// PTY running the claude TUI or a headless chat. This service is the hub the
// other pieces report into:
//
//   renderer   -> create, close, type into, resize sessions (through IPC)
//   hooks      -> status changes for terminal sessions   (ControlServer)
//   MCP tools  -> a master spawning and steering workers  (ControlServer)
//   Chat       -> status changes for chat sessions        (its event stream)
//
// and it pushes the results back out: session events to the renderer, busy
// counts to Power, turn ends to Usage.
//
// Session records are plain mutable objects in a Map. All of this runs on the
// one JS thread, so the interesting concurrency is not shared memory but
// waiting: wait_for_subagents is a Deferred per waiter, raced against a timeout.

import { Context, Deferred, Duration, Effect, Layer, Option, Schedule, Schema, Stream } from "effect"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { ChatEvent } from "../../shared/chat.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import {
  type NewMaster,
  type PermissionMode,
  SessionKind,
  SessionRecord,
  type SessionRole,
  type SessionStatus,
  type SessionView,
} from "../../shared/session.ts"
import { AppPaths } from "../AppPaths.ts"
import { Chat } from "../chat/Chat.ts"
import { ControlEndpoint, ControlHandlers, type HookPayload, TOKEN_HEADER } from "../control/ControlServer.ts"
import { ToolError } from "../control/mcp.ts"
import type { ToolCall } from "../control/tools.ts"
import { Power } from "../power/Power.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { Ui } from "../Ui.ts"
import { Usage } from "../usage/Usage.ts"
import { ClaudeBinary, cleanEnv, defaultMasterName, describeTool, MASTER_PROMPT, nextIcon, WORKER_PROMPT } from "./Claude.ts"
import { Pty, type PtyProcess } from "./Pty.ts"
import { contextTokens, firstLine, lastAssistantText } from "./transcripts.ts"

interface Session {
  readonly id: string
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly parentId: string | null
  readonly cwd: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly createdAt: number
  readonly icon: string | null
  name: string
  task: string | null
  status: SessionStatus
  activity: string
  transcriptPath: string | null
  claudeSessionId: string
  lastMessage: string
  finishedTurns: number
  hadTurn: boolean
  context: number
  // Terminal sessions only: the PTY, and whether it now runs a plain shell.
  proc: PtyProcess | null
  shell: boolean
  // Closed from the app: its exit keeps it listed instead of removing it.
  closing: boolean
  cols: number
  rows: number
}

export interface CreateOptions {
  readonly role: SessionRole
  readonly kind: SessionKind
  readonly cwd: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly task?: string
  readonly name?: string | undefined
  readonly parentId?: string
}

const view = (s: Session): SessionView => ({
  id: s.id,
  name: s.name,
  icon: s.icon,
  role: s.role,
  kind: s.kind,
  parentId: s.parentId,
  status: s.status,
  activity: s.activity,
  model: s.model,
  cwd: s.cwd,
  task: s.task,
  createdAt: s.createdAt,
  finishedTurns: s.finishedTurns,
  context: s.context,
})

const record = (s: Session): SessionRecord => ({
  id: s.id,
  role: s.role,
  kind: s.kind,
  name: s.name,
  icon: s.icon,
  cwd: s.cwd,
  model: s.model,
  permissionMode: s.permissionMode,
  parentId: s.parentId,
  claudeSessionId: s.claudeSessionId,
  transcriptPath: s.transcriptPath,
  hadTurn: s.hadTurn,
  createdAt: s.createdAt,
  closed: s.status === "closed" || s.closing,
})

// Records written by older builds can lack newer fields; fill them in before
// decoding, and skip any record that still does not decode.
const decodeRecords = (raw: unknown): Array<SessionRecord> => {
  if (!Array.isArray(raw)) return []
  const defaults = { kind: "terminal", model: "", permissionMode: "default", icon: null, parentId: null, transcriptPath: null, hadTurn: false, closed: false }
  return raw.flatMap((r) => Option.toArray(Schema.decodeUnknownOption(SessionRecord)({ ...defaults, ...r })))
}

const isSettled = (s: Session) => s.status !== "working" && s.status !== "starting"

// A transcript only exists once the session has had a turn; resuming without
// one fails, so such sessions start fresh under the same Claude session id. Ask
// the disk, not hadTurn: quitting mid-first-turn leaves a transcript behind, and
// --session-id on an existing one is refused as "already in use".
const canResume = (s: Session) => !!s.transcriptPath && fs.existsSync(s.transcriptPath)

const later = (ms: number, f: () => void) => setTimeout(f, ms).unref()

export interface SessionsShape {
  readonly list: Effect.Effect<ReadonlyArray<SessionView>>
  readonly get: (id: string) => Effect.Effect<SessionView | null>
  readonly create: (options: CreateOptions) => Effect.Effect<SessionView>
  readonly createMaster: (options: NewMaster) => Effect.Effect<SessionView>
  readonly rename: (id: string, name: string) => Effect.Effect<void>
  // Masters only; each takes the master's workers along.
  readonly close: (id: string) => Effect.Effect<void>
  readonly reopen: (id: string) => Effect.Effect<void>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly write: (id: string, data: string) => Effect.Effect<void>
  readonly resize: (id: string, cols: number, rows: number) => Effect.Effect<void>
  readonly chatSend: (id: string, text: string) => Effect.Effect<void>
  readonly chatInterrupt: (id: string) => Effect.Effect<void>
  readonly chatRespond: (id: string, requestId: string, decision: PermissionDecision) => Effect.Effect<boolean>
  readonly chatHistory: (id: string) => Effect.Effect<ReadonlyArray<ChatEvent>>
  // Brings back what sessions.json held at the last quit.
  readonly restore: Effect.Effect<void>
  // Every folder the user works in, for project-scoped skills.
  readonly projectDirs: Effect.Effect<ReadonlyArray<string>>
}

const make = Effect.gen(function* () {
  const chat = yield* Chat
  const power = yield* Power
  const settings = yield* SettingsStore
  const usage = yield* Usage
  const ui = yield* Ui
  const pty = yield* Pty
  const claude = yield* ClaudeBinary
  const endpoint = yield* ControlEndpoint
  const { userData } = yield* AppPaths

  const sessions = new Map<string, Session>()
  const waiters = new Set<{ readonly ids: ReadonlyArray<string>; readonly done: Deferred.Deferred<void> }>()
  const sessionsFile = path.join(userData, "sessions.json")
  const mcpDir = path.join(userData, "mcp")
  let quitting = false

  // Effects in here never fail and need nothing, so callbacks from PTYs and
  // timers can run them on the spot.
  const run = <A>(effect: Effect.Effect<A>) => Effect.runSync(effect)
  const runBackground = <A>(effect: Effect.Effect<A>) => void Effect.runFork(effect)

  const childrenOf = (masterId: string) => [...sessions.values()].filter((s) => s.parentId === masterId)
  const masterById = (id: string) => {
    const s = sessions.get(id)
    return s?.role === "master" ? s : null
  }
  const isRunning = (s: Session) => (s.kind === "chat" ? run(chat.has(s.id)) : !!s.proc)

  // ---------- outbound ----------

  const persist = () => {
    fs.mkdirSync(userData, { recursive: true })
    fs.writeFileSync(sessionsFile, JSON.stringify([...sessions.values()].map(record), null, 2))
  }

  const notify = (s: Session, what: string, body: string) => ui.notify(`${s.name} ${what}`, body)

  // Keep awake follows work in flight: a session that has answered, or is
  // waiting on the user, lets the Mac sleep.
  const syncPower = () => {
    const live = [...sessions.values()].filter(isRunning)
    const busy = live.filter((s) => !s.shell && !isSettled(s))
    const current = run(settings.get)
    run(power.apply({ mode: current.keepAwake, lidClosed: current.keepAwakeLidClosed, activeCount: live.length, busyCount: busy.length }))
  }

  // Status changes on every tool call, so power updates are coalesced.
  let powerTimer: ReturnType<typeof setTimeout> | null = null
  const schedulePowerSync = () => {
    powerTimer ??= later(400, () => {
      powerTimer = null
      syncPower()
    })
  }

  const flushWaiters = () => {
    for (const w of waiters) {
      const targets = w.ids.map((id) => sessions.get(id)).filter((s) => s !== undefined)
      if (targets.every(isSettled)) run(Deferred.succeed(w.done, undefined))
    }
  }

  const update = (s: Session) => ui.send("session:update", view(s))

  const setStatus = (s: Session, status: SessionStatus, activity?: string) => {
    s.status = status
    if (activity !== undefined) s.activity = activity
    update(s)
    if (isSettled(s)) flushWaiters()
    schedulePowerSync()
  }

  const refreshContext = (s: Session) => {
    const tokens = contextTokens(s.transcriptPath)
    if (tokens && tokens !== s.context) {
      s.context = tokens
      update(s)
    }
  }

  // ---------- launching ----------

  // Claude Code posts its hooks straight to the control server. The token is
  // interpolated from the session's environment, so it never sits in argv.
  const hookSettings = (id: string) => {
    const entry = (matcher?: string) => [
      {
        ...(matcher ? { matcher } : {}),
        hooks: [
          {
            type: "http",
            url: `${endpoint.url}/hook/${id}`,
            headers: { [TOKEN_HEADER]: "$DAYCARE_TOKEN" },
            allowedEnvVars: ["DAYCARE_TOKEN"],
            timeout: 10,
          },
        ],
      },
    ]
    return {
      hooks: {
        SessionStart: entry(),
        UserPromptSubmit: entry(),
        PreToolUse: entry("*"),
        Notification: entry(),
        Stop: entry(),
      },
    }
  }

  // --mcp-config does not expand env vars, so the token goes in a file only
  // this user can read. The timeout floors the HTTP idle timeout, which would
  // otherwise cut wait_for_subagents off at five minutes.
  const mcpConfigFile = (id: string) => {
    const file = path.join(mcpDir, `${id}.json`)
    fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 })
    const config = {
      mcpServers: {
        daycare: {
          type: "http",
          url: `${endpoint.url}/mcp/${id}`,
          headers: { [TOKEN_HEADER]: endpoint.token },
          timeout: 30 * 60 * 1000,
        },
      },
    }
    fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
    return file
  }

  const startSession = (s: Session, resume: boolean) => {
    const chatMode = s.kind === "chat"
    s.shell = false
    const args = ["--settings", JSON.stringify(hookSettings(s.id))]
    if (!chatMode) args.push("--name", s.name)
    if (resume && canResume(s)) args.push("--resume", s.claudeSessionId)
    else args.push("--session-id", s.claudeSessionId)
    if (s.model) args.push("--model", s.model)
    if (s.permissionMode !== "default") args.push("--permission-mode", s.permissionMode)
    if (s.role === "master") {
      args.push(
        "--mcp-config",
        mcpConfigFile(s.id),
        "--allowedTools",
        "mcp__daycare__*",
        // Workers must be real sessions, so the built-in in-process subagents are off.
        "--disallowedTools",
        "Agent",
        "Task",
        "--append-system-prompt",
        MASTER_PROMPT,
      )
    } else {
      args.push("--append-system-prompt", WORKER_PROMPT)
    }
    if (s.task && !chatMode && !resume) args.push(s.task)

    const dir = fs.existsSync(s.cwd) ? s.cwd : os.homedir()
    const env = {
      ...cleanEnv(process.env),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      DAYCARE_TOKEN: endpoint.token,
      MCP_TOOL_TIMEOUT: String(30 * 60 * 1000),
    }

    if (chatMode) {
      run(chat.start({ id: s.id, cwd: dir, env, args, transcriptPath: resume && canResume(s) ? s.transcriptPath : null }))
      if (s.task && !resume) run(chat.send(s.id, s.task))
    } else {
      const proc = pty.spawn(claude.path, args, { cols: s.cols, rows: s.rows, cwd: dir, env })
      s.proc = proc
      proc.onData((data) => ui.send("pty:data", { id: s.id, data }))
      proc.onExit(() => {
        if (s.proc !== proc) return
        s.proc = null
        // Quitting Claude (Ctrl+C, /exit) leaves a normal shell in the same pane.
        if (!s.closing && !quitting && sessions.get(s.id) === s) startShell(s, dir, env)
        else sessionExited(s)
      })
    }
    // Without a fresh task nothing runs until the user types, and neither kind
    // reports in before then, so a resumed or empty session starts at rest.
    if (resume || !s.task) {
      if (resume) s.lastMessage = lastAssistantText(s.transcriptPath) || s.lastMessage
      setStatus(s, s.hadTurn || s.lastMessage ? "done" : "idle", firstLine(s.lastMessage))
    }
    syncPower()
  }

  // A login shell in the session's folder. Exiting it removes the session.
  const startShell = (s: Session, dir: string, env: NodeJS.ProcessEnv) => {
    let proc: PtyProcess
    try {
      proc = pty.spawn(process.env["SHELL"] || "/bin/zsh", ["-l"], { cols: s.cols, rows: s.rows, cwd: dir, env })
    } catch {
      return sessionExited(s)
    }
    s.proc = proc
    s.shell = true
    ui.send("pty:data", {
      id: s.id,
      data: `\r\n\x1b[2mClaude exited. Run claude --resume ${s.claudeSessionId} to pick it back up.\x1b[0m\r\n`,
    })
    proc.onData((data) => ui.send("pty:data", { id: s.id, data }))
    proc.onExit(() => {
      if (s.proc !== proc) return
      s.proc = null
      sessionExited(s)
    })
    setStatus(s, "exited", "shell")
  }

  const killSession = (s: Session) => {
    if (s.kind === "chat") run(chat.stop(s.id))
    else s.proc?.kill()
  }

  // A session closed from the app stays listed and can be reopened; one whose
  // shell exits on its own leaves the app.
  const sessionExited = (s: Session) => {
    if (quitting) return
    if (!s.closing) return removeSession(s)
    s.closing = false
    s.status = "closed"
    s.activity = ""
    update(s)
    flushWaiters()
    persist()
    syncPower()
    runBackground(usage.refresh())
  }

  // A removed master takes its workers with it. Claude's transcripts stay on disk.
  const removeSession = (s: Session) => {
    if (!sessions.has(s.id)) return
    if (s.role === "master") {
      for (const w of childrenOf(s.id)) {
        killSession(w)
        removeSession(w)
      }
      fs.rmSync(path.join(mcpDir, `${s.id}.json`), { force: true })
    }
    sessions.delete(s.id)
    ui.send("session:removed", { id: s.id, parentId: s.parentId })
    flushWaiters()
    persist()
    syncPower()
  }

  const createSession = (options: CreateOptions, restored: SessionRecord | null = null): Session => {
    const current = run(settings.get)
    const s: Session = {
      id: restored?.id ?? randomUUID(),
      role: options.role,
      kind: options.kind,
      parentId: options.parentId ?? null,
      cwd: options.cwd,
      model: options.model,
      permissionMode: options.permissionMode,
      createdAt: restored?.createdAt ?? Date.now(),
      icon: restored ? restored.icon : options.role === "master" ? nextIcon(new Set([...sessions.values()].filter((x) => x.role === "master").map((x) => x.icon))) : null,
      name:
        options.name ||
        (options.role === "master"
          ? defaultMasterName({
              cwd: options.cwd,
              taken: new Set([...sessions.values()].map((x) => x.name)),
              randomNames: current.randomNames,
              locationLabel: current.locations.find((l) => l.path === options.cwd)?.label,
            })
          : "Worker"),
      task: restored ? null : (options.task ?? null),
      status: restored?.closed ? "closed" : "starting",
      activity: "",
      transcriptPath: restored?.transcriptPath ?? null,
      claudeSessionId: restored?.claudeSessionId ?? randomUUID(),
      lastMessage: "",
      finishedTurns: 0,
      hadTurn: restored?.hadTurn ?? false,
      context: restored ? contextTokens(restored.transcriptPath) : 0,
      proc: null,
      shell: false,
      closing: false,
      cols: 120,
      rows: 32,
    }
    sessions.set(s.id, s)
    ui.send("session:created", view(s))
    persist()
    if (s.status !== "closed") startSession(s, !!restored)
    return s
  }

  // Pastes text into a session's prompt and submits it, the way a user would.
  const submitText = (s: Session, text: string) => {
    if (s.kind === "chat") {
      if (!run(chat.has(s.id))) return false
      run(chat.send(s.id, text))
      return true
    }
    const proc = s.proc
    if (!proc || s.shell) return false
    proc.write(`\x1b[200~${text}\x1b[201~`)
    later(120, () => s.proc === proc && proc.write("\r"))
    return true
  }

  // ---------- hooks (terminal sessions) ----------

  const onHook = (id: string, p: HookPayload) => {
    const s = sessions.get(id)
    if (!s) return
    if (p.session_id) s.claudeSessionId = p.session_id
    if (p.transcript_path && p.transcript_path !== s.transcriptPath) {
      s.transcriptPath = p.transcript_path
      s.context = 0 // a new transcript (/clear, resume): the old count no longer applies
      persist()
    }
    // Chat sessions report through their own stream.
    if (s.kind === "chat") return

    switch (p.hook_event_name) {
      case "SessionStart":
        if (s.status === "starting" && !s.task) setStatus(s, "idle", "")
        break
      case "UserPromptSubmit":
        setStatus(s, "working", "thinking")
        break
      case "PreToolUse":
        setStatus(s, "working", describeTool(p.tool_name ?? "tool", p.tool_input))
        break
      case "Notification": {
        const msg = p.message ?? ""
        if (/waiting for your input/i.test(msg) && s.status === "done") break
        setStatus(s, "needs_you", msg.slice(0, 80) || "needs attention")
        notify(s, "needs you", msg)
        break
      }
      case "Stop": {
        s.finishedTurns += 1
        s.lastMessage = p.last_assistant_message || lastAssistantText(s.transcriptPath)
        setStatus(s, "done", firstLine(s.lastMessage))
        runBackground(usage.refresh())
        // The Stop hook can fire before the final message is flushed to the
        // transcript, so read it again shortly after.
        for (const delay of [400, 1500]) {
          later(delay, () => {
            refreshContext(s)
            const text = lastAssistantText(s.transcriptPath)
            if (text && text !== s.lastMessage && s.status === "done") {
              s.lastMessage = text
              setStatus(s, "done", firstLine(text))
            }
          })
        }
        if (s.role === "master") later(1600, () => notify(s, "finished", firstLine(s.lastMessage)))
        break
      }
    }
    refreshContext(s)
  }

  // ---------- chat events ----------

  const onChatEvent = (id: string, ev: ChatEvent) => {
    const s = sessions.get(id)
    if (!s) return
    ui.send("chat:event", { id, event: ev })
    switch (ev.kind) {
      case "ready":
        if (ev.claudeSessionId) s.claudeSessionId = ev.claudeSessionId
        persist()
        if (s.status === "starting" && !s.task) setStatus(s, "idle", "")
        break
      case "state":
        if (ev.state === "running") setStatus(s, "working", s.activity || "thinking")
        else if (s.status !== "needs_you") setStatus(s, s.hadTurn ? "done" : "idle", firstLine(s.lastMessage))
        break
      case "tool-start":
        setStatus(s, "working", describeTool(ev.name, ev.input))
        break
      case "permission":
        setStatus(s, "needs_you", `allow ${ev.name}`)
        notify(s, "needs you", `Allow ${ev.name}?`)
        break
      case "permission-resolved":
        // tool-start fired before the prompt, so nothing else flips the status back until turn-end.
        if (s.status === "needs_you") setStatus(s, "working", ev.allowed ? "running tool" : "thinking")
        break
      case "turn-end":
        s.finishedTurns += 1
        s.hadTurn = true
        if (ev.text) s.lastMessage = ev.text
        if (ev.contextTokens) s.context = ev.contextTokens
        setStatus(s, "done", firstLine(s.lastMessage))
        persist()
        runBackground(usage.refresh())
        if (s.role === "master") notify(s, "finished", firstLine(s.lastMessage))
        break
      case "exit":
        sessionExited(s)
        break
    }
  }

  // ---------- MCP tools (a master steering its workers) ----------

  const workerSummary = (w: Session) => ({ id: w.id, name: w.name, status: w.status, activity: w.activity, task: w.task })

  const findWorker = (master: Session, ref: string): Effect.Effect<Session, ToolError> => {
    const kids = childrenOf(master.id)
    const w = kids.find((k) => k.id === ref) ?? kids.find((k) => k.name.toLowerCase() === ref.toLowerCase())
    return w
      ? Effect.succeed(w)
      : Effect.fail(new ToolError({ message: `No worker "${ref}". Known workers: ${kids.map((k) => k.name).join(", ") || "none"}` }))
  }

  const waitFor = (ids: ReadonlyArray<string>, timeout: Duration.Duration) =>
    Effect.gen(function* () {
      const waiter = { ids, done: yield* Deferred.make<void>() }
      waiters.add(waiter)
      flushWaiters()
      const settled = yield* Deferred.await(waiter.done).pipe(
        Effect.timeoutOption(timeout),
        // The MCP request can also be cancelled; the waiter goes either way.
        Effect.ensuring(Effect.sync(() => waiters.delete(waiter))),
      )
      return { timedOut: Option.isNone(settled) }
    })

  const onTool = (masterId: string, call: ToolCall): Effect.Effect<unknown, ToolError> =>
    Effect.gen(function* () {
      const master = masterById(masterId)
      if (!master) return yield* new ToolError({ message: "Only a master session can orchestrate workers" })
      switch (call.name) {
        case "spawn_subagent": {
          const w = createSession({
            role: "worker",
            kind: master.kind,
            name: call.input.name,
            task: call.input.task,
            cwd: call.input.cwd || master.cwd,
            model: call.input.model || master.model,
            permissionMode: master.permissionMode,
            parentId: master.id,
          })
          return { id: w.id, name: w.name, note: "Worker started in its own pane." }
        }
        case "list_subagents":
          return childrenOf(master.id).map(workerSummary)
        case "read_subagent": {
          const w = yield* findWorker(master, call.input.worker)
          return { ...workerSummary(w), finalMessage: lastAssistantText(w.transcriptPath) || w.lastMessage || "(no reply yet)" }
        }
        case "send_to_subagent": {
          const w = yield* findWorker(master, call.input.worker)
          if (!submitText(w, call.input.message)) return yield* new ToolError({ message: `${w.name} has exited` })
          setStatus(w, "working", "message from master")
          return { ok: true, name: w.name }
        }
        case "wait_for_subagents": {
          const refs = call.input.workers ?? []
          const ids = refs.length
            ? yield* Effect.forEach(refs, (ref) => findWorker(master, ref).pipe(Effect.map((w) => w.id)))
            : childrenOf(master.id).map((k) => k.id)
          const seconds = Math.min(call.input.timeout_seconds || 900, 1700)
          const { timedOut } = yield* waitFor(ids, Duration.seconds(seconds))
          return {
            timedOut,
            workers: ids.flatMap((id) => {
              const w = sessions.get(id)
              return w ? [{ ...workerSummary(w), summary: firstLine(w.lastMessage) }] : []
            }),
          }
        }
      }
    })

  // ---------- background work ----------

  yield* chat.subscribe.pipe(
    Effect.flatMap((events) => Stream.runForEach(events, ({ id, event }) => Effect.sync(() => onChatEvent(id, event)))),
    Effect.forkScoped,
  )

  // Hooks only fire between steps, so context is re-read every few seconds while
  // a terminal session is mid turn to keep the meters live.
  yield* Effect.sync(() => {
    for (const s of sessions.values()) if (s.status === "working" && s.kind !== "chat") refreshContext(s)
  }).pipe(Effect.repeat(Schedule.spaced("2 seconds")), Effect.forkScoped)

  // A keep-awake setting change takes effect straight away.
  yield* settings.changes.pipe(
    Effect.flatMap((changes) => Stream.runForEach(changes, () => Effect.sync(syncPower))),
    Effect.forkScoped,
  )

  // Quitting: remember what was open, then end every PTY. Chat children are
  // ended by Chat's own finalizer, which runs after this one.
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      quitting = true
      persist()
      for (const s of sessions.values()) if (s.kind === "terminal") s.proc?.kill()
    }),
  )

  // ---------- the service ----------

  const withMaster = (id: string, f: (m: Session) => void) => Effect.sync(() => {
    const m = masterById(id)
    if (m) f(m)
  })

  const service: SessionsShape = {
    list: Effect.sync(() => [...sessions.values()].map(view)),
    get: (id) => Effect.sync(() => {
      const s = sessions.get(id)
      return s ? view(s) : null
    }),
    create: (options) => Effect.sync(() => view(createSession(options))),
    createMaster: (options) =>
      Effect.sync(() =>
        view(
          createSession({
            role: "master",
            kind: options.kind,
            cwd: options.cwd,
            model: options.model,
            permissionMode: options.permissionMode,
            task: options.task,
            name: options.name,
          }),
        ),
      ),
    rename: (id, name) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s || !name.trim()) return
        s.name = name.trim()
        update(s)
        persist()
      }),
    close: (id) =>
      withMaster(id, (master) => {
        for (const s of [master, ...childrenOf(master.id)]) {
          if (s.status === "closed" || s.closing) continue
          s.closing = true
          if (isRunning(s)) killSession(s)
          else sessionExited(s)
        }
      }),
    reopen: (id) =>
      withMaster(id, (master) => {
        for (const s of [master, ...childrenOf(master.id)]) {
          if (s.status !== "closed") continue
          s.status = "starting"
          ui.send("session:created", view(s))
          startSession(s, true)
        }
        persist()
      }),
    remove: (id) =>
      Effect.gen(function* () {
        const master = masterById(id)
        if (!master) return
        const workers = childrenOf(master.id).length
        const ok = yield* ui.confirm({
          message: `Delete ${master.name}?`,
          detail: workers
            ? `This ends it and its ${workers} worker${workers === 1 ? "" : "s"} and removes them from Daycare.`
            : "This ends it and removes it from Daycare.",
          confirmLabel: "Delete",
        })
        if (!ok) return
        removeSession(master)
        killSession(master)
      }),
    write: (id, data) => Effect.sync(() => sessions.get(id)?.proc?.write(data)),
    resize: (id, cols, rows) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s || !(cols > 0 && rows > 0)) return
        s.cols = cols
        s.rows = rows
        s.proc?.resize(cols, rows)
      }),
    chatSend: (id, text) =>
      Effect.sync(() => {
        const s = sessions.get(id)
        if (!s || s.kind !== "chat") return
        run(chat.send(id, text))
        setStatus(s, "working", "thinking")
      }),
    chatInterrupt: (id) => chat.interrupt(id),
    chatRespond: (id, requestId, decision) => chat.respond(id, requestId, decision),
    chatHistory: (id) => chat.history(id),
    restore: Effect.sync(() => {
      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(sessionsFile, "utf8"))
      } catch {
        return
      }
      const records = decodeRecords(raw)
      const masters = records.filter((r) => r.role === "master")
      const masterIds = new Set(masters.map((m) => m.id))
      const workers = records.filter((r) => r.role === "worker" && r.parentId !== null && masterIds.has(r.parentId))
      for (const r of [...masters, ...workers]) {
        createSession(
          {
            role: r.role,
            kind: r.kind,
            cwd: r.cwd,
            model: r.model,
            permissionMode: r.permissionMode,
            name: r.name,
            ...(r.parentId ? { parentId: r.parentId } : {}),
          },
          r,
        )
      }
    }),
    projectDirs: Effect.gen(function* () {
      const current = yield* settings.get
      const dirs = [...[...sessions.values()].map((s) => s.cwd), ...current.locations.map((l) => l.path)]
      return [...new Set(dirs.filter(Boolean))]
    }),
  }

  const handlers = ControlHandlers.of({
    hook: (id, payload) => Effect.sync(() => onHook(id, payload)),
    tool: onTool,
  })

  return { service, handlers }
})

export class Sessions extends Context.Service<Sessions, SessionsShape>()("daycare/Sessions") {
  // One construction provides both faces: Sessions for IPC, ControlHandlers
  // for the control server's routes.
  static readonly layer = Layer.effectContext(
    make.pipe(Effect.map(({ service, handlers }) => Context.make(Sessions, service).pipe(Context.add(ControlHandlers, handlers)))),
  )
}
