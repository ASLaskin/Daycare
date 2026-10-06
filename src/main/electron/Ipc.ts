// Payloads are decoded before handlers run.

import { dialog, ipcMain, Menu, shell } from "electron"
import { Effect, Layer, Schema } from "effect"
import { execFile } from "node:child_process"
import { Invoke, type InvokeChannel, type InvokePayload, type InvokeResult, Send, type SendChannel, type SendPayload } from "../../shared/ipc.ts"
import { AppPaths } from "../AppPaths.ts"
import { Power } from "../power/Power.ts"
import { ClaudeBinary } from "../sessions/Claude.ts"
import { Sessions } from "../sessions/Sessions.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { Skills } from "../skills/Skills.ts"
import { Ui } from "../Ui.ts"
import { Updater } from "../updater/Updater.ts"
import { Usage } from "../usage/Usage.ts"
import { MainWindow } from "./Window.ts"

type Handlers = { readonly [C in InvokeChannel]: (payload: InvokePayload<C>) => Effect.Effect<InvokeResult[C], { readonly message: string }> }
type SendHandlers = { readonly [C in SendChannel]: (payload: SendPayload<C>) => Effect.Effect<void> }

export const Ipc = Layer.effectDiscard(
  Effect.gen(function* () {
    const sessions = yield* Sessions
    const settings = yield* SettingsStore
    const usage = yield* Usage
    const power = yield* Power
    const skills = yield* Skills
    const updater = yield* Updater
    const ui = yield* Ui
    const claude = yield* ClaudeBinary
    const { home } = yield* AppPaths
    const { win } = yield* MainWindow

    const withProjectDirs = <A, E>(f: (dirs: ReadonlyArray<string>) => Effect.Effect<A, E>) => Effect.flatMap(sessions.projectDirs, f)

    const sessionMenu = (id: string) =>
      Effect.gen(function* () {
        const m = yield* sessions.get(id)
        if (!m || m.role !== "master") return
        const later = (effect: Effect.Effect<void>) => () => void Effect.runFork(effect)
        Menu.buildFromTemplate([
          { label: "Rename", click: () => ui.send("session:begin-rename", { id }) },
          m.status === "closed"
            ? { label: "Reopen", click: later(sessions.reopen(id)) }
            : { label: "Close", accelerator: "CmdOrCtrl+W", click: later(sessions.close(id)) },
          { type: "separator" },
          { label: "Delete", click: later(sessions.remove(id)) },
        ]).popup({ window: win })
      })

    const handlers: Handlers = {
      "app:defaults": () => Effect.succeed({ cwd: home, claude: claude.path }),
      "settings:get": () => settings.get,
      "settings:set": (patch) => settings.update(patch),
      "dialog:pick-folder": () =>
        Effect.promise(() => dialog.showOpenDialog(win, { properties: ["openDirectory"] })).pipe(
          Effect.map((r) => (r.canceled ? null : (r.filePaths[0] ?? null))),
        ),
      "open:finder": (dir) => Effect.promise(() => shell.openPath(dir)).pipe(Effect.asVoid),
      // Login shell for PATH, else the bundle.
      "open:vscode": (dir) =>
        Effect.sync(() => {
          execFile("/bin/zsh", ["-lc", "code ."], { cwd: dir }, (err) => {
            if (err) execFile("open", ["-a", "Visual Studio Code", dir])
          })
        }),
      "update:info": () => updater.info,
      "update:run": () => updater.run,
      "usage:get": () => usage.get,
      "usage:refresh": () => usage.refresh({ manual: true }),

      "session:list": () => sessions.list,
      "master:create": (options) => sessions.createMaster(options),
      "session:rename": ({ id, name }) => sessions.rename(id, name),
      "session:close": (id) => sessions.close(id),
      "session:reopen": (id) => sessions.reopen(id),
      "session:delete": (id) => sessions.remove(id),
      "session:menu": sessionMenu,

      "power:status": () => power.status,
      "power:restore": () => power.restore,
      "power:dismiss-error": () => power.dismissError,

      "skills:list": () => withProjectDirs((dirs) => skills.list(dirs)),
      "skills:set": (input) => withProjectDirs((dirs) => skills.setState(input, dirs)),
      "skills:plugin": (input) => withProjectDirs((dirs) => skills.setPlugin(input, dirs)),
      "skills:restore": (input) => withProjectDirs((dirs) => skills.restore(input, dirs)),

      "chat:send": ({ id, text }) => sessions.chatSend(id, text),
      "chat:interrupt": (id) => sessions.chatInterrupt(id),
      "chat:permission": ({ id, requestId, decision }) => sessions.chatRespond(id, requestId, decision),
      "chat:history": (id) => sessions.chatHistory(id),
    }

    const sendHandlers: SendHandlers = {
      "pty:write": ({ id, data }) => sessions.write(id, data),
      "pty:resize": ({ id, cols, rows }) => sessions.resize(id, cols, rows),
    }

    const invokeChannels = Object.keys(Invoke) as Array<InvokeChannel>
    for (const channel of invokeChannels) {
      const decode = Schema.decodeUnknownEffect(Invoke[channel] as Schema.Codec<unknown>)
      const handler = handlers[channel] as (payload: unknown) => Effect.Effect<unknown, { readonly message: string }>
      // Reaches the renderer as this message.
      ipcMain.handle(channel, (_event, payload) =>
        Effect.runPromise(decode(payload).pipe(Effect.flatMap(handler), Effect.mapError((e) => new Error(e.message)))),
      )
    }

    const sendChannels = Object.keys(Send) as Array<SendChannel>
    const listeners = sendChannels.map((channel) => {
      const decode = Schema.decodeUnknownOption(Send[channel] as Schema.Codec<unknown>)
      const handler = sendHandlers[channel] as (payload: unknown) => Effect.Effect<void>
      const listener = (_event: unknown, payload: unknown) => {
        const decoded = decode(payload)
        if (decoded._tag === "Some") Effect.runSync(handler(decoded.value))
      }
      ipcMain.on(channel, listener)
      return [channel, listener] as const
    })

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const channel of invokeChannels) ipcMain.removeHandler(channel)
        for (const [channel, listener] of listeners) ipcMain.removeListener(channel, listener)
      }),
    )
  }),
)
