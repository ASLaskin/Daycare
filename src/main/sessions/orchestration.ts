// The master's MCP tools for steering its workers.

import { Deferred, Duration, Effect, Option } from "effect"
import type { SessionId } from "../../shared/ids.ts"
import type { Json } from "../../shared/json.ts"
import { ToolError } from "../control/mcp.ts"
import type { ToolCall, ToolInput } from "../control/tools.ts"
import { makeArchive } from "./archive.ts"
import type { Core } from "./core.ts"
import type { Lifecycle } from "./lifecycle.ts"
import type { Session } from "./model.ts"
import { firstLine, lastAssistantText } from "./transcripts.ts"
import { workerEffort } from "./workerEffort.ts"
import { workerModel } from "./workerModel.ts"

const DEFAULT_WAIT_SECONDS = 900
const MAX_WAIT_SECONDS = 1700

const workerSummary = (w: Session) => ({ id: w.id, name: w.name, status: w.status, activity: w.activity, task: w.task })

export const makeToolHandler = (core: Core, lifecycle: Lifecycle) => {
  const archiver = makeArchive(core, lifecycle)
  const activeWorkers = (master: Session) => core.childrenOf(master.id).filter((k) => !k.archived)

  const findWorker = (master: Session, ref: string): Effect.Effect<Session, ToolError> => {
    const kids = core.childrenOf(master.id)
    const w = kids.find((k) => k.id === ref) ?? kids.find((k) => k.name.toLowerCase() === ref.toLowerCase())
    if (w) {
      return Effect.succeed(w)
    }
    return Effect.fail(new ToolError({ message: `No worker "${ref}". Known workers: ${kids.map((k) => k.name).join(", ") || "none"}` }))
  }

  const waitFor = (ids: ReadonlyArray<SessionId>, timeout: Duration.Duration) =>
    Effect.gen(function* () {
      const waiter = { ids, done: yield* Deferred.make<void>() }
      core.waiters.add(waiter)
      core.flushWaiters()
      const settled = yield* Deferred.await(waiter.done).pipe(
        Effect.timeoutOption(timeout),
        Effect.ensuring(Effect.sync(() => core.waiters.delete(waiter))),
      )
      return { timedOut: Option.isNone(settled) }
    })

  const spawn = (master: Session, input: ToolInput<"spawn_subagent">) => {
    const settings = core.run(core.deps.settings.get)
    const model = workerModel(settings, master.model, input.model)
    const effort = workerEffort(settings, master.effort, input.effort)
    const w = lifecycle.createSession({
      role: "worker",
      name: input.name,
      task: input.task,
      cwd: input.cwd || master.cwd,
      model,
      effort,
      permissionMode: master.permissionMode,
      parentId: master.id,
    })
    return { id: w.id, name: w.name, model: model || "Claude default", effort: effort || "default", note: "Worker started in its own pane." }
  }

  const read = (master: Session, input: ToolInput<"read_subagent">) =>
    findWorker(master, input.worker).pipe(
      Effect.map((w) => ({ ...workerSummary(w), finalMessage: lastAssistantText(w.transcriptPath) || w.lastMessage || "(no reply yet)" })),
    )

  const send = (master: Session, input: ToolInput<"send_to_subagent">) =>
    Effect.gen(function* () {
      const w = yield* findWorker(master, input.worker)
      if (w.archived) {
        return yield* new ToolError({ message: `${w.name} is archived` })
      }
      if (!lifecycle.submitText(w, input.message)) {
        return yield* new ToolError({ message: `${w.name} has exited` })
      }
      core.setStatus(w, "working", "message from master")
      return { ok: true, name: w.name }
    })

  const wait = (master: Session, input: ToolInput<"wait_for_subagents">) =>
    Effect.gen(function* () {
      const refs = input.workers ?? []
      const ids = refs.length
        ? yield* Effect.forEach(refs, (ref) => findWorker(master, ref).pipe(Effect.map((w) => w.id)))
        : activeWorkers(master).map((k) => k.id)
      const seconds = Math.min(input.timeout_seconds || DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS)
      const { timedOut } = yield* waitFor(ids, Duration.seconds(seconds))
      return {
        timedOut,
        workers: ids.flatMap((id) => {
          const w = core.sessions.get(id)
          return w ? [{ ...workerSummary(w), summary: firstLine(w.lastMessage) }] : []
        }),
      }
    })

  const archive = (master: Session, input: ToolInput<"archive_subagent">) =>
    Effect.gen(function* () {
      const found = yield* Effect.forEach(input.workers, (ref) => findWorker(master, ref))
      found.forEach(archiver.archive)
      return { archived: found.map((w) => w.name) }
    })

  const handle = (masterId: SessionId, call: ToolCall): Effect.Effect<Json, ToolError> => {
    const master = core.masterById(masterId)
    if (!master) {
      return Effect.fail(new ToolError({ message: "Only a master session can orchestrate workers" }))
    }
    switch (call.name) {
      case "spawn_subagent":
        return Effect.sync(() => spawn(master, call.input))
      case "list_subagents":
        return Effect.sync(() => activeWorkers(master).map(workerSummary))
      case "read_subagent":
        return read(master, call.input)
      case "send_to_subagent":
        return send(master, call.input)
      case "wait_for_subagents":
        return wait(master, call.input)
      case "archive_subagent":
        return archive(master, call.input)
    }
  }

  return (masterId: SessionId, call: ToolCall) => Effect.suspend(() => handle(masterId, call))
}
