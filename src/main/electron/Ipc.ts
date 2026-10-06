// IPC handlers, each payload decoded first.

import { Effect, Layer, Schema } from "effect"
import { dialog, ipcMain, shell } from "electron"
import { execFile } from "node:child_process"
import { asDirPath, type DirPath } from "../../shared/ids.ts"
import { Invoke, type InvokeChannel, type InvokePayload, type InvokeResult, Send, type SendChannel, type SendPayload } from "../../shared/ipc.ts"
import { AppPaths } from "../AppPaths.ts"
import { Ui } from "../Ui.ts"
import { Power } from "../power/Power.ts"
import { ClaudeBinary } from "../sessions/Claude.ts"
import { Sessions } from "../sessions/Sessions.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { Skills } from "../skills/Skills.ts"
import { Updater } from "../updater/Updater.ts"
import { Usage } from "../usage/Usage.ts"
import { MainWindow } from "./Window.ts"
import { showSessionMenu } from "./sessionMenu.ts"

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

    const withProjectDirs = <A, E>(f: (dirs: ReadonlyArray<DirPath>) => Effect.Effect<A, E>) => Effect.flatMap(sessions.projectDirs, f)

    const sessionMenu = showSessionMenu(sessions, ui, win)

    const handlers: Handlers = {
      "app:defaults": () => Effect.succeed({ cwd: home, claude: claude.path }),
      "settings:get": () => settings.get,
      "settings:set": (patch) => settings.update(patch),
      "dialog:pick-folder": () =>
        Effect.promise(() => dialog.showOpenDialog(win, { properties: ["openDirectory"] })).pipe(
          Effect.map((r) => {
            const picked = r.canceled ? undefined : r.filePaths[0]
            return picked ? asDirPath(picked) : null
          }),
        ),
      "open:finder": (dir) => Effect.promise(() => shell.openPath(dir)).pipe(Effect.asVoid),
      // VS Code CLI on the login PATH, else the app
      "open:vscode": (dir) =>
        Effect.sync(() => {
          execFile("/bin/zsh", ["-lc", "code ."], { cwd: dir }, (err) => {
            if (err) {
              execFile("open", ["-a", "Visual Studio Code", dir])
            }
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

    // Failures reject with their message
    const handleInvoke = <C extends InvokeChannel>(channel: C) => {
      const decode = Schema.decodeUnknownEffect(Invoke[channel])
      const handler: Handlers[C] = handlers[channel]
      ipcMain.handle(channel, (_event, payload: unknown) =>
        Effect.runPromise(decode(payload).pipe(Effect.flatMap(handler), Effect.mapError((e) => new Error(e.message)))),
      )
    }

    // Payloads that fail to decode are dropped
    const handleSend = <C extends SendChannel>(channel: C) => {
      const decode = Schema.decodeUnknownOption(Send[channel])
      const handler: SendHandlers[C] = sendHandlers[channel]
      const listener = (_event: Electron.IpcMainEvent, payload: unknown) => {
        const decoded = decode(payload)
        if (decoded._tag === "Some") {
          Effect.runSync(handler(decoded.value))
        }
      }
      ipcMain.on(channel, listener)
      return [channel, listener] as const
    }

    const invokeChannels = Object.keys(Invoke) as Array<InvokeChannel>
    invokeChannels.forEach(handleInvoke)
    const sendChannels = Object.keys(Send) as Array<SendChannel>
    const listeners = sendChannels.map(handleSend)

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        invokeChannels.forEach((channel) => ipcMain.removeHandler(channel))
        listeners.forEach(([channel, listener]) => ipcMain.removeListener(channel, listener))
      }),
    )
  }),
)
