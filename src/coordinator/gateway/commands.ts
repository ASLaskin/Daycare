// Phone commands as hub calls, with coded errors.

import { Exit, Schema } from "effect"
import { type Command, Created } from "../../shared/coordinator.ts"
import type { DirPath, SessionId } from "../../shared/ids.ts"
import { DEFAULT_PAGE, type DeviceId, MAX_PAGE, type MobileCommand, type Watch } from "../../shared/mobile.ts"
import type { Cursor } from "../history.ts"
import type { CommandResult, Hub } from "../hub.ts"
import type { Devices } from "../push/devices.ts"
import { configDirOf, createCommand } from "./catalog.ts"
import { fail, messageOf, ok, type Outcome, refused } from "./outcome.ts"
import { saveUpload, TooLarge } from "./uploads.ts"

// What a command may change on its own connection
export interface CommandContext {
  readonly device: DeviceId
  readonly watch: (watch: Watch) => void
}

export interface CommandDeps {
  readonly hub: Hub
  readonly devices: Devices
  readonly attachments: DirPath
}

const decodeCreated = Schema.decodeUnknownExit(Created)

const fromHub = (r: CommandResult): Outcome => ("error" in r ? refused(r.error) : ok(r.result))

const hubCommand = (hub: Hub, command: Command) => Promise.resolve(fromHub(hub.command(command)))

// Throwing hub calls as outcomes
const guarded = (work: () => Outcome | Promise<Outcome>): Promise<Outcome> => {
  try {
    return Promise.resolve(work()).catch((e) => refused(messageOf(e)))
  } catch (e) {
    return Promise.resolve(refused(messageOf(e)))
  }
}

const known = (hub: Hub, id: SessionId) => hub.summary(id) !== null

const cursorOf = (command: { readonly before?: number; readonly after?: number }): Cursor => {
  if (command.before !== undefined) {
    return { before: command.before }
  }
  return command.after !== undefined ? { after: command.after } : null
}

export const makeCommands = ({ hub, devices, attachments }: CommandDeps) => {
  const create = (command: Extract<MobileCommand, { method: "create" }>) => {
    const built = createCommand(hub.catalog(), hub.state().sessions, command)
    if ("error" in built) {
      return fail("rejected", built.error)
    }
    const created = hub.command(built.create)
    if ("error" in created) {
      return refused(created.error)
    }
    const decoded = decodeCreated(created.result)
    if (Exit.isFailure(decoded)) {
      return fail("internal", "the hub did not return the new session")
    }
    const { session } = decoded.value
    if (command.prompt || command.files.length) {
      hub.send(session, { text: command.prompt, images: [], files: command.files })
    }
    return ok({ session })
  }

  const upload = async (name: string, data: Extract<MobileCommand, { method: "upload" }>["data"]) => {
    try {
      return ok({ path: await saveUpload(attachments, name, data) })
    } catch (e) {
      return e instanceof TooLarge ? fail("too_large", e.message) : fail("internal", `could not save ${name}: ${messageOf(e)}`)
    }
  }

  const run = (ctx: CommandContext, command: MobileCommand): Promise<Outcome> => {
    switch (command.method) {
      case "watch":
        ctx.watch({ sessions: command.sessions, deltas: command.deltas })
        return Promise.resolve(ok({}))
      case "history": {
        if (command.before !== undefined && command.after !== undefined) {
          return Promise.resolve(fail("bad_request", "history takes before or after, not both"))
        }
        const limit = Math.min(Math.max(command.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)
        const page = hub.page(command.session, cursorOf(command), limit)
        return Promise.resolve(page ? ok(page) : fail("rejected", `no such session ${command.session}`))
      }
      case "create":
        return guarded(() => create(command))
      case "send":
        return guarded(() => ok(hub.send(command.session, { text: command.text, images: [], files: command.files })))
      case "upload":
        return upload(command.name, command.data)
      case "move": {
        const catalog = hub.catalog()
        const account = catalog ? configDirOf(catalog, command.accountId) : null
        if (!account) {
          return Promise.resolve(fail("rejected", `unknown account ${command.accountId}`))
        }
        return hub.move(command.session, command.accountId, account.configDir).then(fromHub)
      }
      case "model":
        return hub.setModel(command.session, command.model).then(fromHub)
      case "effort":
        return hub.setEffort(command.session, command.effort).then(fromHub)
      case "power":
        return hubCommand(hub, { method: "power", mode: command.mode })
      case "media":
        return Promise.resolve(known(hub, command.session) ? ok({ session: command.session, items: [...hub.media(command.session)] }) : fail("rejected", `no such session ${command.session}`))
      case "register":
        devices.register({
          device: ctx.device,
          apnsToken: command.apnsToken,
          environment: command.environment,
          pushToStart: command.pushToStart,
          kinds: command.kinds,
        })
        return Promise.resolve(ok({}))
      case "unregister":
        devices.unregister(ctx.device)
        return Promise.resolve(ok({}))
      case "activity":
        devices.setActivity(ctx.device, command.activity, command.token)
        return Promise.resolve(ok({}))
      case "activity-ended":
        devices.endActivity(command.activity)
        return Promise.resolve(ok({}))
      case "interrupt":
      case "answer":
      case "close":
      case "reopen":
      case "archive":
      case "unarchive":
      case "rename":
      case "remove":
      case "configure":
        return hubCommand(hub, command)
    }
  }

  // Unexpected exceptions are internal, so the outbox retries
  return (ctx: CommandContext, command: MobileCommand): Promise<Outcome> => {
    try {
      return run(ctx, command).catch((e) => fail("internal", messageOf(e)))
    } catch (e) {
      return Promise.resolve(fail("internal", messageOf(e)))
    }
  }
}

export type Commands = ReturnType<typeof makeCommands>
