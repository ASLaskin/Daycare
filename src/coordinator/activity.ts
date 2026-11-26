// Open turns and background tasks per session, deciding busy or done.

import type { ChatEvent } from "../shared/chat.ts"
import type { SessionId, TaskId } from "../shared/ids.ts"

export type Activity = "busy" | "done" | null

const WORK = new Set<ChatEvent["kind"]>(["text-delta", "text", "thinking", "tool-start", "tool-end"])
const ACTIVE_TASK = new Set(["running", "pending"])

export const makeActivity = () => {
  const tasks = new Map<SessionId, Set<TaskId>>()
  const open = new Set<SessionId>()
  const idle = (id: SessionId) => !open.has(id) && !tasks.get(id)?.size

  const track = (id: SessionId, task: TaskId, active: boolean) => {
    const set = tasks.get(id) ?? new Set<TaskId>()
    if (active) {
      set.add(task)
    } else {
      set.delete(task)
    }
    tasks.set(id, set)
  }

  return {
    observe: (id: SessionId, event: ChatEvent): Activity => {
      if (WORK.has(event.kind)) {
        open.add(id)
        return "busy"
      }
      switch (event.kind) {
        case "task":
          track(id, event.taskId, ACTIVE_TASK.has(event.status))
          return ACTIVE_TASK.has(event.status) ? "busy" : idle(id) ? "done" : null
        case "turn-end":
          open.delete(id)
          return idle(id) ? "done" : null
        default:
          return null
      }
    },
    // Provider stopped; its tasks went with it
    forget: (id: SessionId) => {
      open.delete(id)
      tasks.delete(id)
    },
  }
}
