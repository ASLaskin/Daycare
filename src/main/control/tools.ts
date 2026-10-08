// The master's MCP tools, one Schema each.

import { Schema } from "effect"
import { Provider } from "../../shared/coordinator.ts"
import { DirPath } from "../../shared/ids.ts"

const desc = (description: string) => ({ description })

export const SpawnSubagent = Schema.Struct({
  name: Schema.String.annotate(desc('Short display name, e.g. "video-3-script"')),
  task: Schema.String.annotate(desc("Complete instructions for the worker")),
  provider: Schema.optionalKey(Provider.annotate(desc("Optional agent provider; defaults to the master's"))),
  model: Schema.optionalKey(Schema.String.annotate(desc("Optional model override"))),
  cwd: Schema.optionalKey(DirPath.annotate(desc("Optional working directory; defaults to the master's"))),
})

export const ListSubagents = Schema.Struct({})

export const WaitForSubagents = Schema.Struct({
  workers: Schema.optionalKey(Schema.Array(Schema.String).annotate(desc("Worker names or ids; omit for all"))),
  timeout_seconds: Schema.optionalKey(Schema.Finite.annotate(desc("Max seconds to wait (default 900)"))),
})

export const ReadSubagent = Schema.Struct({
  worker: Schema.String.annotate(desc("Worker name or id")),
})

export const SendToSubagent = Schema.Struct({
  worker: Schema.String.annotate(desc("Worker name or id")),
  message: Schema.String,
})

export const Tools = {
  spawn_subagent: {
    input: SpawnSubagent,
    description:
      "Start a worker: a full agent session that the user can see and talk to directly. Give it a short name and a complete, self-contained task. Returns immediately; use wait_for_subagents to wait for it.",
  },
  list_subagents: {
    input: ListSubagents,
    description: "List this master's workers with their current state.",
  },
  wait_for_subagents: {
    input: WaitForSubagents,
    description:
      "Block until the given workers (or all workers) stop working: finished their turn, need the user, or stopped. Returns each worker's state and the first line of its final message.",
  },
  read_subagent: {
    input: ReadSubagent,
    description: "Read a worker's latest final message (its summary), plus state. Does not return the full transcript.",
  },
  send_to_subagent: {
    input: SendToSubagent,
    description: "Send a follow-up message to a worker, as if the user typed it.",
  },
} as const

export type ToolName = keyof typeof Tools
export type ToolInput<N extends ToolName> = (typeof Tools)[N]["input"]["Type"]

export type ToolCall = { [N in ToolName]: { readonly name: N; readonly input: ToolInput<N> } }[ToolName]

// Tool listing with object input schemas
export const toolList = Object.entries(Tools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: { properties: {}, ...Schema.toJsonSchemaDocument(tool.input).schema, type: "object" },
}))

export const isToolName = (name: string): name is ToolName => Object.hasOwn(Tools, name)
