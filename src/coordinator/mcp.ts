// Stdio MCP server giving one master the Daycare tools over the coordinator socket.

import net from "node:net"
import pkg from "../../package.json" with { type: "json" }
import { toolList } from "../main/control/tools.ts"
import { type Json, type JsonObject, obj, parseJson, str } from "../shared/json.ts"
import { lineSplitter } from "../shared/lines.ts"
import { runtimeDir, socketPath } from "../shared/runtime.ts"

const LINE_LIMIT = 64 * 1024 * 1024

type Reply = { readonly result: Json } | { readonly error: string }

const master = process.argv[2]
if (!master) {
  console.error("usage: mcp.ts <master-session-id>")
  process.exit(2)
}

const out = (msg: JsonObject) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`)

const pending = new Map<number, (reply: Reply) => void>()
let nextId = 1
let link: Promise<net.Socket> | null = null

// Requests-only coordinator connection, opened on first use and after a drop
const coordinator = (): Promise<net.Socket> => {
  link ??= new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath(runtimeDir(process.env)))
    socket.setEncoding("utf8")
    socket.on("connect", () => socket.write(`${JSON.stringify({ type: "hello", version: pkg.version, subscribe: false })}\n`))
    socket.on(
      "data",
      lineSplitter(
        LINE_LIMIT,
        (line) => {
          const msg = obj(parseJson(line))
          const type = str(msg?.["type"])
          if (type === "ready") {
            resolve(socket)
            return
          }
          if (type === "version_mismatch" || type === "error") {
            reject(new Error(`coordinator refused the bridge: ${line}`))
            return
          }
          const id = msg?.["id"]
          const done = typeof id === "number" ? pending.get(id) : undefined
          if (msg && done && typeof id === "number") {
            pending.delete(id)
            const error = str(msg["error"])
            done(error === null ? { result: msg["result"] ?? null } : { error })
          }
        },
        () => socket.destroy(),
      ),
    )
    socket.on("error", (e) => reject(e))
    socket.on("close", () => {
      link = null
      pending.forEach((done) => done({ error: "coordinator connection closed" }))
      pending.clear()
    })
  })
  const opening = link
  opening.catch(() => {
    if (link === opening) {
      link = null
    }
  })
  return opening
}

const call = async (name: Json | undefined, input: Json | undefined): Promise<Reply> => {
  try {
    const socket = await coordinator()
    const id = nextId++
    return await new Promise<Reply>((resolve) => {
      pending.set(id, resolve)
      socket.write(`${JSON.stringify({ type: "request", id, command: { method: "tool", master, name: str(name) ?? "", input: input ?? {} } })}\n`)
    })
  } catch (e) {
    return { error: `coordinator unavailable: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const text = (content: string, isError: boolean): Json => ({ content: [{ type: "text", text: content }], isError })

const answer = async (method: string, params: JsonObject): Promise<{ readonly result: Json } | { readonly error: JsonObject }> => {
  switch (method) {
    case "initialize":
      return {
        result: { protocolVersion: params["protocolVersion"] ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "daycare", version: pkg.version } },
      }
    case "ping":
      return { result: {} }
    case "tools/list":
      return { result: { tools: toolList } }
    case "tools/call": {
      const reply = await call(params["name"], params["arguments"])
      return { result: "error" in reply ? text(reply.error, true) : text(JSON.stringify(reply.result), false) }
    }
    default:
      return { error: { code: -32601, message: `unsupported method ${method}` } }
  }
}

process.stdin.setEncoding("utf8")
process.stdin.on(
  "data",
  lineSplitter(
    LINE_LIMIT,
    (line) => {
      const msg = obj(parseJson(line))
      const method = str(msg?.["method"])
      const id = msg?.["id"]
      // Notifications need no reply
      if (!msg || !method || id === undefined) {
        return
      }
      void answer(method, obj(msg["params"]) ?? {}).then((reply) => out({ id, ...reply }))
    },
    () => console.error("daycare mcp: dropped an oversized line"),
  ),
)
// Ends once stdin closes and the coordinator connection is gone
process.stdin.on("end", () => {
  void link?.then((s) => s.end()).catch(() => {})
})
