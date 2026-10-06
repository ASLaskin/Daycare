import type { ChatEventOf } from "../../shared/chat.ts"
import type { Json } from "../../shared/json.ts"
import { el } from "../dom.ts"
import { capMap, MAX_TASKS } from "./caps.ts"
import { fmtTokens, rec } from "./format.ts"
import type { ChatSession, TaskEntry } from "./types.ts"

type TaskState = "running" | "done" | "error"

const TASK_STATE: Record<string, TaskState> = {
  running: "running",
  started: "running",
  in_progress: "running",
  progress: "running",
  pending: "running",
  completed: "done",
  complete: "done",
  done: "done",
  success: "done",
  failed: "error",
  error: "error",
  killed: "error",
  stopped: "error",
  cancelled: "error",
}
const TASK_LABEL: Record<TaskState, string> = { running: "Running", done: "Done", error: "Stopped" }

const stateOf = (t: TaskEntry): TaskState => (t.status && TASK_STATE[t.status]) || "running"

const usageText = (u: Json | undefined) => {
  if (u == null) {
    return ""
  }
  if (typeof u === "number") {
    return `${fmtTokens(u)} tokens`
  }
  const r = rec(u)
  if (!r) {
    return ""
  }
  const tok = r["total_tokens"] ?? r["totalTokens"] ?? r["tokens"]
  const tools = r["tool_uses"] ?? r["toolUses"]
  const parts = [typeof tok === "number" && tok ? `${fmtTokens(tok)} tokens` : "", tools ? `${String(tools)} tools` : ""]
  return parts.filter(Boolean).join(" · ")
}

// Record a subagent task, ignoring background shell tasks
export const task = (s: ChatSession, ev: ChatEventOf<"task">) => {
  const prev = s.tasks.get(ev.taskId)
  if (!prev && !ev.subagentType) {
    return
  }
  const t: TaskEntry = { ...prev }
  if (ev.status) {
    t.status = ev.status
  }
  if (ev.description) {
    t.description = ev.description
  }
  if (ev.subagentType) {
    t.subagentType = ev.subagentType
  }
  if (ev.summary) {
    t.summary = ev.summary
  }
  if (ev.lastTool) {
    t.lastTool = ev.lastTool
  }
  if (ev.usage != null) {
    t.usage = ev.usage
  }
  s.tasks.set(ev.taskId, t)
  capMap(s.tasks, MAX_TASKS)
  renderTasks(s)
}

const taskRow = (t: TaskEntry) => {
  const st = stateOf(t)
  const row = el("div", `chat-task ${st}`)
  row.append(el("span", "chat-task-dot"))
  const main = el("div", "chat-task-main")
  const line = el("div", "chat-task-line")
  line.append(el("span", "chat-task-desc", t.description || "Subagent"))
  if (t.subagentType) {
    line.append(el("span", "chat-task-type", t.subagentType))
  }
  main.append(line)
  const sub = [
    t.lastTool && st === "running" ? t.lastTool : "",
    t.summary && st !== "running" ? t.summary : "",
    usageText(t.usage),
  ].filter(Boolean)
  if (sub.length) {
    main.append(el("div", "chat-task-sub", sub.join(" · ")))
  }
  row.append(main, el("span", "chat-task-state", TASK_LABEL[st]))
  return row
}

export const renderTasks = (s: ChatSession) => {
  const all = [...s.tasks.values()]
  s.taskbar.hidden = all.length === 0
  if (!all.length) {
    return
  }
  const running = all.filter((t) => stateOf(t) === "running").length
  s.taskSummary.textContent = `${all.length} ${all.length === 1 ? "subagent" : "subagents"}${running ? `, ${running} running` : ""}`
  s.taskbar.classList.toggle("busy", running > 0)
  s.taskList.replaceChildren(...all.map(taskRow))
}
