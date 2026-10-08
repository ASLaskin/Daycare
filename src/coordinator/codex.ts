// Codex provider: one app-server process per active session.

import { Result } from "effect"
import pkg from "../../package.json" with { type: "json" }
import type { ChatEvent } from "../shared/chat.ts"
import { asNativeId, type StoredSession } from "../shared/coordinator.ts"
import { asRequestId, type FilePath, type RequestId } from "../shared/ids.ts"
import { at, type Json, type JsonObject, obj, parseJson, str } from "../shared/json.ts"
import { lineSplitter } from "../shared/lines.ts"
import type { PermissionMode } from "../shared/session.ts"
import { codexEvents } from "./codexEvents.ts"
import { codexRequest } from "./codexRequests.ts"
import { spawnGroup, stopGroup } from "./process.ts"
import type { Answer, ProviderHandle, ProviderUpdate } from "./provider.ts"

// Codex version whose protocol Daycare was tested against
export const TESTED_CODEX = "0.160.1"
const LINE_LIMIT = 64 * 1024 * 1024

const POLICY: Readonly<Record<PermissionMode, { readonly approvalPolicy: string; readonly sandbox: string }>> = {
  default: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
  acceptEdits: { approvalPolicy: "on-request", sandbox: "workspace-write" },
  plan: { approvalPolicy: "untrusted", sandbox: "read-only" },
  bypassPermissions: { approvalPolicy: "never", sandbox: "danger-full-access" },
}

// A config warning saying the requested sandbox cannot be enforced
const SANDBOX_WARNING = /sandbox|bubblewrap|bwrap|namespace/i

type Spawn = typeof spawnGroup

export const startCodex = (session: StoredSession, codexPath: FilePath, update: (u: ProviderUpdate) => void, spawn: Spawn = spawnGroup): ProviderHandle => {
  if (!session.nativeId && session.state !== "creating") {
    throw new Error("codex session has no thread: its creation is incomplete")
  }
  const child = spawn(codexPath, ["app-server"], { cwd: session.cwd, env: process.env })
  const pending = new Map<number, { readonly resolve: (result: Json) => void; readonly reject: (e: Error) => void }>()
  const approvals = new Map<RequestId, { readonly id: Json; readonly reply: (answer: Answer) => Json | null }>()
  const queued: Array<string> = []
  let thread: string | null = null
  let turn: string | null = null
  let unsandboxed = false
  let nextId = 1
  let exited = false

  const write = (msg: JsonObject) => {
    if (!exited) {
      child.stdin.write(`${JSON.stringify(msg)}\n`)
    }
  }
  const event = (e: ChatEvent) => update({ type: "event", event: e })
  const fail = (message: string) => update({ type: "error", message })

  const request = (method: string, params: Json) =>
    new Promise<Json>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      write({ id, method, params })
    })

  const startTurn = (text: string) => {
    request("turn/start", { threadId: thread, input: [{ type: "text", text }] }).catch((e: Error) => fail(`turn/start: ${e.message}`))
  }

  const onRequest = (id: Json, method: string, params: Json | undefined) => {
    const key = asRequestId(JSON.stringify(id))
    const r = codexRequest(key, method, params)
    if (r.kind === "unsupported") {
      write({ id, error: { code: -32601, message: r.message } })
      fail(r.message)
      return
    }
    approvals.set(key, { id, reply: r.reply })
    update({ type: "approval", request: key, choices: r.choices, event: r.event })
  }

  const onNotification = (method: string, params: Json | undefined) => {
    if (method === "turn/started") {
      turn = str(at(params, "turn", "id")) ?? turn
    }
    if (method === "configWarning") {
      const text = `${str(at(params, "summary")) ?? ""} ${str(at(params, "details")) ?? ""}`
      unsandboxed = unsandboxed || SANDBOX_WARNING.test(text)
      event({ kind: "notice", message: `Codex: ${text.trim()}` })
    }
    if (method === "serverRequest/resolved") {
      const key = asRequestId(JSON.stringify(at(params, "requestId") ?? null))
      if (approvals.delete(key)) {
        update({ type: "approval-gone", request: key })
      }
    }
    const events = codexEvents(method, params)
    if (Result.isFailure(events)) {
      fail(events.failure)
      return
    }
    events.success.forEach(event)
  }

  const onLine = (line: string) => {
    const msg = obj(parseJson(line))
    if (!msg) {
      fail(`unreadable codex line: ${line.slice(0, 200)}`)
      return
    }
    const method = str(msg["method"])
    const id = msg["id"]
    if (method && id !== undefined) {
      onRequest(id, method, msg["params"])
      return
    }
    if (method) {
      onNotification(method, msg["params"])
      return
    }
    const waiting = typeof id === "number" ? pending.get(id) : undefined
    if (!waiting || typeof id !== "number") {
      return
    }
    pending.delete(id)
    const error = obj(msg["error"])
    if (error) {
      waiting.reject(new Error(str(error["message"]) ?? "codex error"))
      return
    }
    waiting.resolve(msg["result"] ?? null)
  }

  child.stdout.setEncoding("utf8")
  child.stdout.on("data", lineSplitter(LINE_LIMIT, onLine, () => fail("codex sent an oversized line")))
  child.on("exit", () => {
    exited = true
    pending.forEach((p) => p.reject(new Error("codex exited")))
    pending.clear()
    update({ type: "exited" })
  })

  // Handshake, account and thread, then queued input
  const open = async () => {
    const init = await request("initialize", { clientInfo: { name: "daycare", version: pkg.version } })
    const version = /\d+\.\d+\.\d+/.exec(str(at(init, "userAgent")) ?? "")?.[0]
    if (version !== TESTED_CODEX) {
      event({ kind: "notice", message: `Codex ${version ?? "of unknown version"} is untested; Daycare was tested with ${TESTED_CODEX}.` })
    }
    write({ method: "initialized" })
    const account = await request("account/read", {})
    if (at(account, "account") == null && at(account, "requiresOpenaiAuth") === true) {
      throw new Error("Codex is not logged in. Run `codex login`, then start a new session.")
    }
    const policy = unsandboxed ? { approvalPolicy: "untrusted", sandbox: POLICY[session.permissionMode].sandbox } : POLICY[session.permissionMode]
    if (unsandboxed) {
      event({ kind: "notice", message: "Codex cannot enforce its sandbox here, so every command asks for approval." })
    }
    const params = { cwd: session.cwd, ...policy, ...(session.model ? { model: session.model } : {}) }
    const opened = session.nativeId
      ? await request("thread/resume", { ...params, threadId: session.nativeId })
      : await request("thread/start", params)
    const id = str(at(opened, "thread", "id"))
    if (!id) {
      throw new Error("codex returned a thread without an id")
    }
    if (session.nativeId && id !== session.nativeId) {
      throw new Error(`codex resumed thread ${id}, expected ${session.nativeId}`)
    }
    if (!session.nativeId) {
      update({ type: "native", nativeId: asNativeId(id) })
    }
    update({ type: "created" })
    thread = id
    queued.splice(0).forEach(startTurn)
  }

  open().catch((e: Error) => {
    fail(e.message)
    child.stdin.end()
  })

  return {
    input: (text) => {
      if (thread) {
        startTurn(text)
        return
      }
      queued.push(text)
    },
    interrupt: () => {
      if (thread && turn) {
        request("turn/interrupt", { threadId: thread, turnId: turn }).catch((e: Error) => fail(`interrupt failed: ${e.message}`))
      }
    },
    answer: (request, answer) => {
      const waiting = approvals.get(request)
      const result = waiting?.reply(answer) ?? null
      if (!waiting || result === null) {
        return false
      }
      approvals.delete(request)
      write({ id: waiting.id, result })
      return true
    },
    close: async () => {
      child.stdin.end()
      await stopGroup(child)
    },
  }
}
