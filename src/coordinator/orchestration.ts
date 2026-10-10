// Tools a master uses to start, steer and wait for its workers.

import { Result, Schema } from "effect"
import path from "node:path"
import type { SessionHistory, StoredSession, WorkerModels } from "../shared/coordinator.ts"
import type { Provider } from "../shared/session.ts"
import type { SessionId } from "../shared/ids.ts"
import type { Json } from "../shared/json.ts"
import { isToolName, type ToolInput, Tools } from "../main/control/tools.ts"
import { workerModel } from "../main/sessions/workerModel.ts"
import { Refused } from "./provider.ts"
import { runtimeDir } from "../shared/runtime.ts"

const DEFAULT_WAIT_SECONDS = 900
// Below the MCP tool timeout providers are given
export const MAX_WAIT_SECONDS = 1700
// How long a provider has to confirm it took a message
export const ACK_MS = 30_000
// MCP tool timeout given to providers
export const TOOL_TIMEOUT_SECONDS = 1800

export const DAYCARE_TOOLS = Object.keys(Tools)

// How a provider starts the MCP bridge for one master
export const bridge = (master: SessionId) => ({
  command: process.execPath,
  // mcp.ts from source, mcp.js from the dist bundle
  args: [path.join(import.meta.dir, `mcp${path.extname(import.meta.path)}`), master],
  env: { DAYCARE_RUNTIME_DIR: runtimeDir(process.env) },
})

export interface WorkerSpec {
  readonly master: StoredSession
  readonly name: string
  readonly provider: Provider
  readonly model: string | null
  readonly cwd: StoredSession["cwd"]
}

// What orchestration needs from the hub
export interface OrchestrationCore {
  readonly session: (id: SessionId) => StoredSession
  readonly sessions: () => ReadonlyArray<StoredSession>
  readonly needsUser: (id: SessionId) => boolean
  readonly workerModels: () => WorkerModels
  readonly createWorker: (spec: WorkerSpec) => SessionId
  readonly send: (id: SessionId, text: string) => Promise<void>
  readonly history: (id: SessionId) => SessionHistory
}

interface Waiter {
  readonly ids: ReadonlyArray<SessionId>
  readonly finish: (timedOut: boolean) => void
}

// Provider confirmation, or uncertain
export const delivery = async (accepted: Promise<void>, ms = ACK_MS): Promise<"provider" | "uncertain"> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<"uncertain">((resolve) => {
    timer = setTimeout(() => resolve("uncertain"), ms)
  })
  try {
    return await Promise.race([accepted.then(() => "provider" as const), late])
  } catch (e) {
    if (e instanceof Refused) {
      throw e
    }
    return "uncertain"
  } finally {
    clearTimeout(timer)
  }
}

export const makeOrchestration = (core: OrchestrationCore, ackMs = ACK_MS) => {
  const waiters = new Set<Waiter>()

  const workers = (master: SessionId) => core.sessions().filter((s) => s.parentId === master)

  // Worker by id, else case-insensitive name
  const worker = (master: SessionId, ref: string) => {
    const all = workers(master)
    const found = all.find((w) => w.id === ref) ?? all.find((w) => w.name.toLowerCase() === ref.toLowerCase())
    if (!found) {
      throw new Error(`no worker "${ref}"; known workers: ${all.map((w) => w.name).join(", ") || "none"}`)
    }
    return found
  }

  // Absent once deleted
  const find = (id: SessionId) => core.sessions().find((s) => s.id === id)

  // Done: turn over, needs user, closed, or deleted
  const settled = (id: SessionId) => {
    const s = find(id)
    return !s || core.needsUser(id) || s.closed || (s.state !== "creating" && s.state !== "running")
  }

  const summary = (s: StoredSession) => ({
    id: s.id,
    name: s.name,
    provider: s.provider,
    state: s.state,
    needsUser: core.needsUser(s.id),
    error: s.error,
  })

  // Latest reply text and whether history was truncated
  const lastReply = (id: SessionId) => {
    const h = core.history(id)
    if ("error" in h) {
      return { reply: h.error, truncated: false }
    }
    const reply = [...h.events].reverse().flatMap((e) => ((e.kind === "text" || e.kind === "turn-end") && e.text ? [e.text] : []))[0]
    return { reply: reply ?? "(no reply yet)", truncated: h.evicted }
  }

  const sendTo = async (w: StoredSession, text: string) => {
    try {
      return await delivery(core.send(w.id, text), ackMs)
    } catch (e) {
      throw new Error(`${w.name} did not receive the message: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Model settings cover Claude workers; empty is Claude's default
  const modelFor = (master: StoredSession, provider: Provider, requested: string | undefined) => {
    if (provider !== "claude") {
      return requested ?? (provider === master.provider ? master.model : null)
    }
    const masterModel = master.provider === "claude" ? (master.model ?? "") : ""
    return workerModel(core.workerModels(), masterModel, requested) || null
  }

  const spawn = async (master: StoredSession, input: ToolInput<"spawn_subagent">) => {
    const provider = input.provider ?? master.provider
    const model = modelFor(master, provider, input.model)
    const id = core.createWorker({ master, name: input.name, provider, model, cwd: input.cwd ?? master.cwd })
    const w = core.session(id)
    const delivered = await sendTo(w, input.task)
    return { id, name: w.name, provider, model: model ?? "default", delivered, note: "Worker started; the user can see and talk to it." }
  }

  const wait = (master: StoredSession, input: ToolInput<"wait_for_subagents">, signal: AbortSignal) => {
    const refs = input.workers ?? []
    const ids = refs.length ? refs.map((r) => worker(master.id, r).id) : workers(master.id).map((w) => w.id)
    const seconds = Math.min(Math.max(input.timeout_seconds ?? DEFAULT_WAIT_SECONDS, 0), MAX_WAIT_SECONDS)
    return new Promise<Json>((resolve) => {
      const finish = (timedOut: boolean) => {
        waiters.delete(waiter)
        clearTimeout(timer)
        signal.removeEventListener("abort", abandon)
        resolve({
          timedOut,
          workers: ids.map((id) => {
            const s = find(id)
            return s ? { ...summary(s), summary: lastReply(id).reply.split("\n")[0] ?? "" } : { id, removed: true }
          }),
        })
      }
      const waiter: Waiter = { ids, finish }
      const timer = setTimeout(() => finish(true), seconds * 1000)
      const abandon = () => {
        waiters.delete(waiter)
        clearTimeout(timer)
      }
      signal.addEventListener("abort", abandon, { once: true })
      waiters.add(waiter)
      settle()
    })
  }

  // Answers waits whose workers have all settled
  const settle = () => [...waiters].filter((w) => w.ids.every(settled)).forEach((w) => w.finish(false))

  const run = async (masterId: SessionId, name: string, raw: Json, signal: AbortSignal): Promise<Json> => {
    const master = core.session(masterId)
    if (master.role !== "master") {
      throw new Error("only a master session can orchestrate workers")
    }
    if (!isToolName(name)) {
      throw new Error(`unknown tool ${name}`)
    }
    const decoded = Schema.decodeUnknownResult(Tools[name].input)(raw)
    if (Result.isFailure(decoded)) {
      throw new Error(`bad arguments for ${name}: ${decoded.failure.message}`)
    }
    const input = decoded.success
    switch (name) {
      case "spawn_subagent":
        return spawn(master, input as ToolInput<"spawn_subagent">)
      case "list_subagents":
        return workers(master.id).map(summary)
      case "read_subagent": {
        const w = worker(master.id, (input as ToolInput<"read_subagent">).worker)
        const { reply, truncated } = lastReply(w.id)
        return { ...summary(w), finalMessage: reply, historyTruncated: truncated }
      }
      case "send_to_subagent": {
        const { worker: ref, message } = input as ToolInput<"send_to_subagent">
        const w = worker(master.id, ref)
        return { name: w.name, delivered: await sendTo(w, message) }
      }
      case "wait_for_subagents":
        return wait(master, input as ToolInput<"wait_for_subagents">, signal)
    }
  }

  return { run, settle }
}
