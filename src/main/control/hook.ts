// Hook request shape and the token header.

import { Schema } from "effect"
import { ClaudeSessionId, FilePath } from "../../shared/ids.ts"

export const TOKEN_HEADER = "x-daycare-token"

// Hook fields Daycare reads
export const HookPayload = Schema.Struct({
  hook_event_name: Schema.String,
  session_id: Schema.optionalKey(ClaudeSessionId),
  transcript_path: Schema.optionalKey(FilePath),
  tool_name: Schema.optionalKey(Schema.String),
  tool_input: Schema.optionalKey(Schema.Json),
  message: Schema.optionalKey(Schema.String),
  last_assistant_message: Schema.optionalKey(Schema.String),
})
export type HookPayload = typeof HookPayload.Type
