// Terminal session status from Claude Code hooks.

import type { SessionId } from "../../shared/ids.ts"
import type { HookPayload } from "../control/hook.ts"
import { describeTool } from "./activity.ts"
import { type Core, later } from "./core.ts"
import type { Session } from "./model.ts"
import { firstLine, lastAssistantText } from "./transcripts.ts"

const ACTIVITY_MAX = 80
const TRANSCRIPT_RECHECK_MS = [400, 1500]
const FINISHED_NOTICE_MS = 1600

export const makeHookHandler = (core: Core) => {
  const { setStatus, notify } = core

  // Final text from the transcript once it is flushed
  const recheckTranscript = (s: Session) => {
    core.refreshContext(s)
    const text = lastAssistantText(s.transcriptPath)
    if (!text || text === s.lastMessage || s.status !== "done") {
      return
    }
    s.lastMessage = text
    setStatus(s, "done", firstLine(text))
  }

  const onNotification = (s: Session, p: HookPayload) => {
    const msg = p.message ?? ""
    // Ignore idle reminders after a finished turn
    if (/waiting for your input/i.test(msg) && s.status === "done") {
      return
    }
    setStatus(s, "needs_you", msg.slice(0, ACTIVITY_MAX) || "needs attention")
    notify(s, "needs you", msg)
  }

  const onStop = (s: Session, p: HookPayload) => {
    s.finishedTurns += 1
    s.lastMessage = p.last_assistant_message || lastAssistantText(s.transcriptPath)
    setStatus(s, "done", firstLine(s.lastMessage))
    core.runBackground(core.deps.usage.refresh())
    TRANSCRIPT_RECHECK_MS.forEach((delay) => later(delay, () => recheckTranscript(s)))
    if (s.role === "master") {
      later(FINISHED_NOTICE_MS, () => notify(s, "finished", firstLine(s.lastMessage)))
    }
  }

  const onEvent = (s: Session, p: HookPayload) => {
    switch (p.hook_event_name) {
      case "SessionStart":
        if (s.status === "starting" && !s.task) {
          setStatus(s, "idle", "")
        }
        return
      case "UserPromptSubmit":
        setStatus(s, "working", "thinking")
        return
      case "PreToolUse":
        setStatus(s, "working", describeTool(p.tool_name ?? "tool", p.tool_input))
        return
      case "Notification":
        onNotification(s, p)
        return
      case "Stop":
        onStop(s, p)
        return
    }
  }

  // Track transcript changes for every session
  const trackTranscript = (s: Session, p: HookPayload) => {
    if (p.session_id) {
      s.claudeSessionId = p.session_id
    }
    if (!p.transcript_path || p.transcript_path === s.transcriptPath) {
      return
    }
    s.transcriptPath = p.transcript_path
    s.context = 0
    core.persist()
  }

  return (id: SessionId, p: HookPayload) => {
    const s = core.sessions.get(id)
    if (!s) {
      return
    }
    trackTranscript(s, p)
    // Chat sessions report through their own stream
    if (s.kind === "chat") {
      return
    }
    onEvent(s, p)
    core.refreshContext(s)
  }
}
