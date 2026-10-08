// Codex server requests as Daycare approvals, and their replies.

import type { ChatEvent } from "../shared/chat.ts"
import { asToolUseId, type RequestId } from "../shared/ids.ts"
import { arr, at, type Json, type JsonObject, obj, str } from "../shared/json.ts"
import type { Answer } from "./provider.ts"

export type CodexRequest =
  | {
      readonly kind: "approval"
      readonly choices: ReadonlyArray<string>
      readonly event: ChatEvent
      // Codex's reply for an answer, or null when the choice was not offered
      readonly reply: (answer: Answer) => Json | null
    }
  | { readonly kind: "unsupported"; readonly message: string }

const DECISIONS = ["accept", "acceptForSession", "decline", "cancel"]

// Label of an offered decision: a string, or an object keyed by its name
const decisionLabel = (d: Json) => str(d) ?? Object.keys(obj(d) ?? {})[0] ?? null

const permission = (request: RequestId, params: JsonObject, name: string, title: string, input: Json): ChatEvent => {
  const item = str(params["itemId"])
  return {
    kind: "permission",
    requestId: request,
    toolUseId: item ? asToolUseId(item) : null,
    name,
    title,
    input,
    description: str(params["reason"]) ?? "",
    suggestions: [],
    requiresUserInteraction: false,
  }
}

// Approval whose reply wraps the chosen decision payload
const decide = (event: ChatEvent, offered: ReadonlyArray<Json>): CodexRequest => {
  const labelled = offered.flatMap((d) => {
    const label = decisionLabel(d)
    return label ? [{ label, d }] : []
  })
  return {
    kind: "approval",
    choices: labelled.map((c) => c.label),
    event,
    reply: ({ choice }) => {
      const hit = labelled.find((c) => c.label === choice)
      return hit ? { decision: hit.d } : null
    },
  }
}

const commandApproval = (request: RequestId, params: JsonObject): CodexRequest => {
  const command = str(params["command"]) ?? ""
  const offered = arr(params["availableDecisions"])
  return decide(permission(request, params, "Bash", command || "Run a command", { command, cwd: params["cwd"] ?? null }), offered.length ? offered : DECISIONS)
}

const fileApproval = (request: RequestId, params: JsonObject): CodexRequest =>
  decide(permission(request, params, "Edit", "Edit files", { grantRoot: params["grantRoot"] ?? null }), DECISIONS)

const permissionsApproval = (request: RequestId, params: JsonObject): CodexRequest => {
  const requested = params["permissions"] ?? {}
  const grant: Readonly<Record<string, Json>> = {
    accept: { permissions: requested, scope: "turn" },
    acceptForSession: { permissions: requested, scope: "session" },
    decline: { permissions: {} },
  }
  return {
    kind: "approval",
    choices: Object.keys(grant),
    event: permission(request, params, "Permissions", "Grant additional permissions", requested),
    reply: ({ choice }) => grant[choice] ?? null,
  }
}

// Only tool-call approvals; forms need a schema-driven UI
const elicitation = (request: RequestId, params: JsonObject): CodexRequest => {
  if (at(params, "_meta", "codex_approval_kind") !== "mcp_tool_call") {
    return { kind: "unsupported", message: `daycare does not support MCP ${str(params["mode"]) ?? "elicitation"} requests yet` }
  }
  const server = str(params["serverName"]) ?? "mcp"
  const replies: Readonly<Record<string, Json>> = { accept: { action: "accept", content: {} }, decline: { action: "decline" }, cancel: { action: "cancel" } }
  return {
    kind: "approval",
    choices: Object.keys(replies),
    event: permission(request, params, `mcp__${server}`, str(params["message"]) ?? `Use a ${server} tool`, params),
    reply: ({ choice }) => replies[choice] ?? null,
  }
}

const HANDLERS: Readonly<Record<string, (request: RequestId, params: JsonObject) => CodexRequest>> = {
  "item/commandExecution/requestApproval": commandApproval,
  "item/fileChange/requestApproval": fileApproval,
  "item/permissions/requestApproval": permissionsApproval,
  "mcpServer/elicitation/request": elicitation,
}

export const codexRequest = (request: RequestId, method: string, params: Json | undefined): CodexRequest => {
  const handler = HANDLERS[method]
  if (!handler) {
    return { kind: "unsupported", message: `daycare does not support ${method}` }
  }
  return handler(request, obj(params) ?? {})
}
