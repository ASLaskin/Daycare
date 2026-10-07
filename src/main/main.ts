// Main process entry: the layer graph and quit handling.

import { app } from "electron"
import { Effect, Fiber, Layer } from "effect"
import path from "node:path"
import { AppPaths } from "./AppPaths.ts"
import { Chat } from "./chat/Chat.ts"
import { ControlEndpoint, ControlHttpServer, ControlRoutes } from "./control/ControlServer.ts"
import { AppIcon } from "./electron/AppIcon.ts"
import { Boot } from "./electron/Boot.ts"
import { ElectronPaths } from "./electron/ElectronPaths.ts"
import { ElectronUi } from "./electron/ElectronUi.ts"
import { Ipc } from "./electron/Ipc.ts"
import { MainWindow } from "./electron/Window.ts"
import { ElectronPowerBlocker } from "./power/ElectronPowerBlocker.ts"
import { defaultPowerConfig } from "./power/config.ts"
import { Power } from "./power/Power.ts"
import { ClaudeBinary } from "./sessions/Claude.ts"
import { Sessions } from "./sessions/Sessions.ts"
import { SettingsStore } from "./settings/SettingsStore.ts"
import { Skills } from "./skills/Skills.ts"
import { Updater } from "./updater/Updater.ts"
import { Usage } from "./usage/Usage.ts"
import { UsageSource } from "./usage/UsageSource.ts"

app.setName("Daycare")

const Platform = Layer.mergeAll(ElectronPaths, ClaudeBinary.layer, Skills.layer)

const Window = ElectronUi.pipe(Layer.provideMerge(MainWindow.layer))

const ChatLive = Layer.unwrap(ClaudeBinary.use((claude) => Effect.succeed(Chat.layer(claude.path))))

const PowerLive = Layer.unwrap(
  AppPaths.use(({ userData }) => Effect.succeed(Power.layer(defaultPowerConfig(path.join(userData, "lid-release"))))),
).pipe(Layer.provide(ElectronPowerBlocker))

const Control = ControlEndpoint.layer.pipe(Layer.provideMerge(ControlHttpServer))

const Services = Layer.mergeAll(
  SettingsStore.layer,
  Usage.layer.pipe(Layer.provide(UsageSource.layer)),
  ChatLive,
  PowerLive,
  Updater.layer,
).pipe(Layer.provideMerge(Window), Layer.provideMerge(Control))

// Sessions plus the ControlHandlers it provides
const Core = Sessions.layer.pipe(Layer.provideMerge(Services))

const App = Layer.mergeAll(ControlRoutes, Ipc, AppIcon).pipe(
  Layer.provideMerge(Core),
  Layer.provideMerge(Platform),
)

const main = Layer.launch(Boot.pipe(Layer.provide(App))).pipe(
  Effect.tapCause((cause) => Effect.logError("Daycare failed to start", cause)),
)

const fiber = Effect.runFork(main)

// First quit waits for every finalizer
let unwound = false
app.on("before-quit", (event) => {
  if (unwound) {
    return
  }
  event.preventDefault()
  Effect.runPromise(Fiber.interrupt(fiber)).finally(() => {
    unwound = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
