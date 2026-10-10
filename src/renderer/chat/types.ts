import type { DirPath, RequestId, SessionId, TaskId, ToolUseId } from "../../shared/ids.ts"
import type { Json, JsonObject } from "../../shared/json.ts"
import type { SessionView } from "../../shared/session.ts"

export interface TextBlock {
  readonly kind: "text"
  readonly el: HTMLElement
  raw: string
  pending: string
  final: boolean
  fenced: boolean
  tail: Text | null
  raf: number
}

export interface ThinkBlock {
  readonly kind: "think"
  readonly final: true
  readonly el: HTMLElement
  readonly label: HTMLElement
  readonly meta: HTMLElement
  readonly body: HTMLElement
}

export type Block = TextBlock | ThinkBlock

export interface ToolCard {
  readonly wrap: HTMLElement
  readonly head: HTMLElement
  readonly arg: HTMLElement
  readonly note: HTMLElement
  readonly body: HTMLElement
  readonly kids: HTMLElement
  input: Json
  done: boolean
  open: boolean
  isError: boolean
  content: string
  structured: Json | null
}

export interface Perm {
  card: HTMLElement
  answered: boolean
  readonly name: string
  readonly what: string
  summary: ((allowed: boolean, label?: string) => string) | null
}

export interface TaskEntry {
  status?: string
  description?: string
  subagentType?: string
  summary?: string
  lastTool?: string
  usage?: JsonObject
}

export interface Stats {
  model: string
  cost: number
  ctx: number
  turns: number
  rate: number | null
}

export interface ChatSession {
  readonly id: SessionId
  // Session as mounted, for rebuilding the pane
  readonly info: SessionView
  readonly name: string
  cwd: DirPath
  readonly host: HTMLElement
  readonly blocks: Map<string, Block>
  readonly tools: Map<ToolUseId, ToolCard>
  readonly perms: Map<RequestId, Perm>
  readonly tasks: Map<TaskId, TaskEntry>
  turn: { readonly el: HTMLElement; hasText: boolean } | null
  epoch: number
  // Count of events applied live
  applied: number
  running: boolean
  stopping: boolean
  ended: boolean
  pinned: boolean
  hydrating: boolean
  stickRaf: number
  liveThink: ThinkBlock | null
  emptyEl: HTMLElement | null
  readonly stats: Stats
  wasHidden: boolean
  savedTop: number
  readonly timers: Set<ReturnType<typeof setTimeout>>
  readonly ro: ResizeObserver
  readonly root: HTMLElement
  readonly scroll: HTMLElement
  readonly thread: HTMLElement
  readonly working: HTMLElement
  readonly jump: HTMLElement
  readonly input: HTMLTextAreaElement
  readonly send: HTMLButtonElement
  readonly stop: HTMLButtonElement
  readonly foot: HTMLElement
  readonly taskbar: HTMLElement
  readonly taskList: HTMLElement
  readonly taskSummary: HTMLElement
}
