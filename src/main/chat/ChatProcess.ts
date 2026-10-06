// One headless claude child over stream-json.

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import type { ChatEvent } from "../../shared/chat.ts"
import type { DirPath, FilePath, SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import { LineFramer, parseLine } from "./framing.ts"
import { StreamNormalizer } from "./normalize.ts"
import { HISTORY_MAX, historyFromTranscript } from "./transcript.ts"

const BASE_ARGS = [
  "-p",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
  // Permission prompts as stdout control requests.
  "--permission-prompt-tool",
  "stdio",
]

// Enables session_state_changed events.
const ENV_FORCED = { CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" }

const STDERR_MAX = 4096
const TERM_AFTER_MS = 2000
const KILL_AFTER_MS = 5000

export interface ChatStart {
  readonly id: SessionId
  readonly cwd: DirPath
  readonly env: NodeJS.ProcessEnv
  readonly args?: ReadonlyArray<string>
  // Transcript to replay when resuming.
  readonly transcriptPath?: FilePath | null
}

export class ChatProcess {
  readonly normalizer: StreamNormalizer
  readonly events: Array<ChatEvent>
  exited = false
  stopping = false

  private readonly child: ChildProcessWithoutNullStreams
  private readonly framer = new LineFramer()
  private readonly outbox: Array<string> = []
  private readonly timers: Array<ReturnType<typeof setTimeout>> = []
  private spawned = false
  private draining = false
  private stderr = ""
  private skipped = 0

  constructor(
    readonly id: SessionId,
    opts: ChatStart,
    claudePath: FilePath,
    private readonly publish: (event: ChatEvent) => void,
    private readonly onGone: () => void,
  ) {
    this.normalizer = new StreamNormalizer(opts.cwd)
    this.events = historyFromTranscript(opts.transcriptPath ?? null)
    this.child = spawn(claudePath, [...BASE_ARGS, ...(opts.args ?? [])], {
      cwd: opts.cwd,
      env: { ...opts.env, ...ENV_FORCED },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.child.stdout.setEncoding("utf8")
    this.child.stderr.setEncoding("utf8")
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk))
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_MAX)
    })
    // Ignore pipe errors.
    const pipes = [this.child.stdin, this.child.stdout, this.child.stderr]
    pipes.forEach((s) => s.on("error", () => {}))
    this.child.on("spawn", () => {
      this.spawned = true
      if (this.stopping) {
        this.child.stdin.end()
        return
      }
      this.flush()
    })
    this.child.on("error", (err: NodeJS.ErrnoException) =>
      this.emit({ kind: "error", message: `Could not run claude: ${err.code ?? err.message}` }),
    )
    this.child.on("close", (code) => this.onClose(code))
  }

  emitAll(events: ReadonlyArray<ChatEvent>) {
    events.forEach((event) => this.emit(event))
  }

  write(message: Json) {
    this.outbox.push(`${JSON.stringify(message)}\n`)
    this.flush()
  }

  // Ends stdin, then escalates to SIGTERM and SIGKILL.
  stop() {
    if (this.exited || this.stopping) {
      return
    }
    this.stopping = true
    this.outbox.length = 0
    if (this.spawned) {
      this.child.stdin.end()
    }
    this.timers.push(
      setTimeout(() => this.child.kill("SIGTERM"), TERM_AFTER_MS),
      setTimeout(() => this.child.kill("SIGKILL"), KILL_AFTER_MS),
    )
  }

  // Kills immediately, for app quit.
  kill() {
    if (this.exited) {
      return
    }
    this.stopping = true
    this.outbox.length = 0
    this.clearTimers()
    try {
      this.child.kill("SIGKILL")
    } catch {}
  }

  private emit(event: ChatEvent) {
    // History keeps everything except text deltas.
    if (event.kind !== "text-delta") {
      this.events.push(event)
      if (this.events.length >= HISTORY_MAX + 200) {
        this.events.splice(0, this.events.length - HISTORY_MAX)
      }
    }
    this.publish(event)
  }

  private onData(chunk: string) {
    const { lines, dropped } = this.framer.push(chunk)
    lines.forEach((line) => this.onLine(line))
    if (dropped) {
      this.skipped++
      this.emit({ kind: "error", message: "Dropped an oversized line from claude" })
    }
  }

  private onLine(line: string) {
    if (!line.trim()) {
      return
    }
    const msg = parseLine(line)
    if (!msg) {
      this.skipped++
      return
    }
    try {
      this.emitAll(this.normalizer.handle(msg))
    } catch {
      this.skipped++
    }
  }

  // Writes queued lines once spawned and drained.
  private flush() {
    const stdin = this.child.stdin
    if (!this.spawned || this.draining || this.exited || !stdin.writable) {
      return
    }
    while (this.outbox.length) {
      if (!stdin.write(this.outbox.shift()!)) {
        this.draining = true
        stdin.once("drain", () => {
          this.draining = false
          this.flush()
        })
        return
      }
    }
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers.length = 0
  }

  private onClose(code: number | null) {
    if (this.exited) {
      return
    }
    this.onLine(this.framer.end())
    this.exited = true
    this.normalizer.state = "exited"
    this.outbox.length = 0
    this.clearTimers()
    const pending = [...this.normalizer.permissions.keys()]
    pending.forEach((requestId) => this.emitAll(this.normalizer.resolvePermission(requestId, false)))
    console.log(`[chat ${this.id}] exit code=${code} pid=${this.child.pid} skipped=${this.skipped}`)
    this.emit({ kind: "exit", code, stderrTail: this.stderr.trim() })
    if (this.stopping) {
      this.onGone()
    }
  }
}
