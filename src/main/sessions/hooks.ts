// Transcript tracking from Claude Code hooks.

import type { SessionId } from "../../shared/ids.ts"
import type { HookPayload } from "../control/hook.ts"
import type { Core } from "./core.ts"

export const makeHookHandler = (core: Core) => (id: SessionId, p: HookPayload) => {
  const s = core.sessions.get(id)
  if (!s) {
    return
  }
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
