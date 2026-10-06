// Chat session status from the chat event stream.

import type { ChatEvent, ChatEventOf } from "../../shared/chat.ts"
import type { SessionId } from "../../shared/ids.ts"
import { describeTool } from "./activity.ts"
import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import type { Session } from "./model.ts"
import { firstLine } from "./transcripts.ts"

export const makeChatEventHandler = (core: Core, lifecycle: Lifecycle) => {
  const { setStatus, notify } = core

  const onReady = (s: Session, ev: ChatEventOf<"ready">) => {
    if (ev.claudeSessionId) {
      s.claudeSessionId = ev.claudeSessionId
    }
    core.persist()
    if (s.status === "starting" && !s.task) {
      setStatus(s, "idle", "")
    }
  }

  const onState = (s: Session, ev: ChatEventOf<"state">) => {
    if (ev.state === "running") {
      setStatus(s, "working", s.activity || "thinking")
      return
    }
    if (s.status !== "needs_you") {
      setStatus(s, s.hadTurn ? "done" : "idle", firstLine(s.lastMessage))
    }
  }

  // Answered prompt resumes work
  const onPermissionResolved = (s: Session, ev: ChatEventOf<"permission-resolved">) => {
    if (s.status === "needs_you") {
      setStatus(s, "working", ev.allowed ? "running tool" : "thinking")
    }
  }

  const onTurnEnd = (s: Session, ev: ChatEventOf<"turn-end">) => {
    s.finishedTurns += 1
    s.hadTurn = true
    if (ev.text) {
      s.lastMessage = ev.text
    }
    if (ev.contextTokens) {
      s.context = ev.contextTokens
    }
    setStatus(s, "done", firstLine(s.lastMessage))
    core.persist()
    core.runBackground(core.deps.usage.refresh())
    if (s.role === "master") {
      notify(s, "finished", firstLine(s.lastMessage))
    }
  }

  const onEvent = (s: Session, ev: ChatEvent) => {
    switch (ev.kind) {
      case "ready":
        return onReady(s, ev)
      case "state":
        return onState(s, ev)
      case "tool-start":
        return setStatus(s, "working", describeTool(ev.name, ev.input))
      case "permission":
        setStatus(s, "needs_you", `allow ${ev.name}`)
        return notify(s, "needs you", `Allow ${ev.name}?`)
      case "permission-resolved":
        return onPermissionResolved(s, ev)
      case "turn-end":
        return onTurnEnd(s, ev)
      case "exit":
        return lifecycle.sessionExited(s)
    }
  }

  return (id: SessionId, ev: ChatEvent) => {
    const s = core.sessions.get(id)
    if (!s) {
      return
    }
    core.deps.ui.send("chat:event", { id, event: ev })
    onEvent(s, ev)
  }
}
