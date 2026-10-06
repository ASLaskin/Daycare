// What the control routes call into.

import { Context, type Effect } from "effect"
import type { SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import type { HookPayload } from "./hook.ts"
import type { ToolError } from "./mcp.ts"
import type { ToolCall } from "./tools.ts"

export class ControlHandlers extends Context.Service<
  ControlHandlers,
  {
    readonly hook: (id: SessionId, payload: HookPayload) => Effect.Effect<void>
    readonly tool: (masterId: SessionId, call: ToolCall) => Effect.Effect<Json, ToolError>
  }
>()("daycare/ControlHandlers") {}
