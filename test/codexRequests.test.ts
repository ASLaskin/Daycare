// Codex server requests as Daycare approvals and their replies.

import { expect, test } from "bun:test"
import { type CodexRequest, codexRequest } from "../src/coordinator/codexRequests.ts"
import { asRequestId } from "../src/shared/ids.ts"
import type { Json } from "../src/shared/json.ts"

const request = asRequestId("7")

const approval = (method: string, params: Json) => {
  const r: CodexRequest = codexRequest(request, method, params)
  if (r.kind !== "approval") {
    throw new Error(`expected an approval, got ${r.kind}`)
  }
  return r
}

test("command approvals offer every available decision and reply with its payload", () => {
  const amendment = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["ls"] } }
  const r = approval("item/commandExecution/requestApproval", { itemId: "c", command: "ls", availableDecisions: ["accept", amendment, "cancel"] })
  expect(r.choices).toEqual(["accept", "acceptWithExecpolicyAmendment", "cancel"])
  expect(r.reply({ choice: "acceptWithExecpolicyAmendment" })).toEqual({ decision: amendment })
  expect(r.reply({ choice: "decline" })).toBeNull()
  expect(r.event.kind === "permission" ? [r.event.name, r.event.title] : null).toEqual(["Bash", "ls"])
})

test("without offered decisions a command gets the standard four", () => {
  expect(approval("item/commandExecution/requestApproval", { itemId: "c" }).choices).toEqual(["accept", "acceptForSession", "decline", "cancel"])
})

test("permission requests grant the requested profile for the turn or session, or nothing", () => {
  const permissions = { network: { enabled: true } }
  const r = approval("item/permissions/requestApproval", { itemId: "p", permissions, reason: "fetch" })
  expect(r.reply({ choice: "accept" })).toEqual({ permissions, scope: "turn" })
  expect(r.reply({ choice: "acceptForSession" })).toEqual({ permissions, scope: "session" })
  expect(r.reply({ choice: "decline" })).toEqual({ permissions: {} })
})

test("MCP tool-call approvals are approvals; forms are refused", () => {
  const call = approval("mcpServer/elicitation/request", { serverName: "github", mode: "form", message: "Allow?", _meta: { codex_approval_kind: "mcp_tool_call" } })
  expect(call.reply({ choice: "accept" })).toEqual({ action: "accept", content: {} })
  expect(codexRequest(request, "mcpServer/elicitation/request", { serverName: "github", mode: "form", message: "Your name?" }).kind).toBe("unsupported")
})

test("questions are refused while Codex offers them only in plan mode", () => {
  const params = { itemId: "u", isBlocking: true, questions: [{ id: "q", header: "Lang", question: "Which?" }] }
  expect(codexRequest(request, "item/tool/requestUserInput", params)).toEqual({ kind: "unsupported", message: "daycare does not support item/tool/requestUserInput" })
})

test("Daycare's own tool-call approvals are accepted without asking", () => {
  const params = { serverName: "daycare", mode: "form", message: "Allow spawn_subagent?", _meta: { codex_approval_kind: "mcp_tool_call" } }
  expect(codexRequest(request, "mcpServer/elicitation/request", params)).toEqual({ kind: "auto", result: { action: "accept", content: {} } })
  expect(codexRequest(request, "mcpServer/elicitation/request", { ...params, _meta: {} }).kind).toBe("unsupported")
})

test("other requests are unsupported by name", () => {
  expect(codexRequest(request, "account/chatgptAuthTokens/refresh", {})).toEqual({ kind: "unsupported", message: "daycare does not support account/chatgptAuthTokens/refresh" })
})
