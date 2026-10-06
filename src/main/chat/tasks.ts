// Subagent task state from system events.

import type { ChatEventOf, TaskUsage } from "../../shared/chat.ts"
import type { Json } from "./content.ts"

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
  private readonly tasks = new Map<string, TaskState>()

  update(msg: Json): ChatEventOf<"task"> | null {
    const id = msg["task_id"]
    if (!id) return null
    const t = this.tasks.get(id) ?? { description: "", subagentType: null, summary: "", lastTool: null, usage: null }
    switch (msg["subtype"]) {
      case "task_started":
        t.description = msg["description"] || ""
        t.subagentType = msg["subagent_type"] || null
        t.status = "running"
        break
      case "task_progress":
        t.lastTool = msg["last_tool_name"] || t.lastTool
        t.usage = msg["usage"] || t.usage
        t.status = t.status || "running"
        break
      case "task_updated":
        t.status = msg["patch"]?.status || t.status || "running"
        break
      default:
        t.status = msg["status"] || t.status || "completed"
        t.summary = msg["summary"] || t.summary
        t.usage = msg["usage"] || t.usage
    }
    // Re-insert so oldest evicts first.
    this.tasks.delete(id)
    this.tasks.set(id, t)
    if (this.tasks.size > TASKS_MAX) this.tasks.delete(this.tasks.keys().next().value!)
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
