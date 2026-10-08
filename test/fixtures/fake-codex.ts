// Fake codex app-server: scripted replies, logs every received message.
// Env: LOG (file), LOGGED_OUT=1, VERSION. Prompt words: "approve", "unsupported", "wait".

import { appendFileSync } from "node:fs"

const log = process.env["LOG"] ?? "/dev/null"
const send = (msg: object) => process.stdout.write(`${JSON.stringify(msg)}\n`)
const turnId = "turn-1"
let pendingText = ""

const turnBody = (threadId: string, text: string) => {
  send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress" } } })
  send({ method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "m1", delta: "Hel" } })
  send({ method: "item/completed", params: { threadId, turnId, item: { type: "agentMessage", id: "m1", text: `Hello ${text}` } } })
  send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "completed" } } })
}

const handle = (msg: { id?: number | string; method?: string; params?: { threadId?: string; input?: Array<{ text?: string }> }; result?: unknown; error?: unknown }) => {
  appendFileSync(log, `${JSON.stringify(msg)}\n`)
  const threadId = msg.params?.threadId ?? "thread-1"
  switch (msg.method) {
    case "initialize":
      send({ id: msg.id, result: { userAgent: `codex_cli_rs/${process.env["VERSION"] ?? "0.160.1"} (Linux)`, codexHome: "/tmp", platformFamily: "unix", platformOs: "linux" } })
      return
    case "account/read":
      send({ id: msg.id, result: process.env["LOGGED_OUT"] ? { account: null, requiresOpenaiAuth: true } : { account: { type: "chatgpt" }, requiresOpenaiAuth: true } })
      send({ method: "thread/tokenUsage/updated", params: { surprise: true } })
      return
    case "thread/start":
      send({ id: msg.id, result: { thread: { id: "thread-1" } } })
      return
    case "thread/resume":
      send({ id: msg.id, result: { thread: { id: threadId } } })
      return
    case "turn/start": {
      const text = msg.params?.input?.[0]?.text ?? ""
      send({ id: msg.id, result: { turn: { id: turnId, items: [], status: "inProgress" } } })
      if (text.includes("approve")) {
        pendingText = text
        send({ id: 900, method: "item/commandExecution/requestApproval", params: { threadId, turnId, itemId: "c1", command: "ls", startedAtMs: 0 } })
        return
      }
      if (text.includes("unsupported")) {
        send({ id: 901, method: "item/tool/call", params: { threadId } })
        return
      }
      if (text.includes("wait")) {
        send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress" } } })
        return
      }
      turnBody(threadId, text)
      return
    }
    case "turn/interrupt":
      send({ id: msg.id, result: {} })
      send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "interrupted" } } })
      return
  }
  if (msg.id === 900) {
    turnBody("thread-1", pendingText)
  }
}

let buf = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk: string) => {
  const parts = (buf + chunk).split("\n")
  buf = parts.pop() ?? ""
  parts.filter(Boolean).forEach((line) => handle(JSON.parse(line)))
})
process.stdin.on("end", () => process.exit(0))
