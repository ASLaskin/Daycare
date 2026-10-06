// Subagent task state from system events.

import type { ChatEventOf, TaskUsage } from "../../shared/chat.ts"
import { asTaskId, type TaskId } from "../../shared/ids.ts"
import { at, type JsonObject, obj, str } from "../../shared/json.ts"

const TASKS_MAX = 500

interface TaskState {
  description: string
  subagentType: string | null
  summary: string
  lastTool: string | null
  usage: TaskUsage | null
  status?: string
}

export class TaskTracker {
  private readonly tasks = new Map<TaskId, TaskState>()

  update(msg: JsonObject): ChatEventOf<"task"> | null {
    const raw = str(msg["task_id"])
    if (!raw) {
      return null
    }
    const id = asTaskId(raw)
    const t = this.tasks.get(id) ?? { description: "", subagentType: null, summary: "", lastTool: null, usage: null }
    const text = (key: string) => str(msg[key]) || null
    const usage = obj(msg["usage"])
    switch (msg["subtype"]) {
      case "task_started":
        t.description = text("description") ?? ""
        t.subagentType = text("subagent_type")
        t.status = "running"
        break
      case "task_progress":
        t.lastTool = text("last_tool_name") ?? t.lastTool
        t.usage = usage ?? t.usage
        t.status = t.status || "running"
        break
      case "task_updated":
        t.status = str(at(msg, "patch", "status")) || t.status || "running"
        break
      default:
        t.status = text("status") ?? (t.status || "completed")
        t.summary = text("summary") ?? t.summary
        t.usage = usage ?? t.usage
    }
    // Moves the task to newest.
    this.tasks.delete(id)
    this.tasks.set(id, t)
    if (this.tasks.size > TASKS_MAX) {
      this.tasks.delete(this.tasks.keys().next().value!)
    }
    return {
      kind: "task",
      taskId: id,
      status: t.status ?? "running",
      description: t.description,
      subagentType: t.subagentType,
      summary: t.summary,
      lastTool: t.lastTool,
      usage: t.usage,
    }
  }
}
