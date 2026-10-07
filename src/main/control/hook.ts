// Hook request shape and the token header.

import { Schema } from "effect"
import { ClaudeSessionId, FilePath } from "../../shared/ids.ts"

export const TOKEN_HEADER = "x-daycare-token"

// Hook fields Daycare reads
export const HookPayload = Schema.Struct({
  hook_event_name: Schema.String,
  session_id: Schema.optionalKey(ClaudeSessionId),
  transcript_path: Schema.optionalKey(FilePath),
})
export type HookPayload = typeof HookPayload.Type
