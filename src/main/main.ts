// Main process entry: the layer graph and quit handling.

import { app } from "electron"
import { Effect, Fiber, Layer } from "effect"
import { Accounts } from "./accounts/Accounts.ts"
import { registerMediaScheme } from "./attachments/MediaProtocol.ts"
import { coordinatorSessions } from "./coordinator/CoordinatorSessions.ts"
import { AppIcon } from "./electron/AppIcon.ts"
import { Boot } from "./electron/Boot.ts"
import { ElectronPaths } from "./electron/ElectronPaths.ts"
import { ElectronUi } from "./electron/ElectronUi.ts"
import { Ipc } from "./electron/Ipc.ts"
import { MainWindow } from "./electron/Window.ts"
import { ClaudeBinary } from "./sessions/Claude.ts"
import { SettingsStore } from "./settings/SettingsStore.ts"
import { Skills } from "./skills/Skills.ts"
import { Updater } from "./updater/Updater.ts"
import { Usage } from "./usage/Usage.ts"
import { UsageSource } from "./usage/UsageSource.ts"

app.setName("Daycare")
registerMediaScheme()

const Platform = Layer.mergeAll(ElectronPaths, ClaudeBinary.layer, Skills.layer)

const Window = ElectronUi.pipe(Layer.provideMerge(MainWindow.layer))

const Services = Layer.mergeAll(Accounts.layer, Usage.layer.pipe(Layer.provide(UsageSource.layer)), Updater.layer).pipe(
  Layer.provideMerge(Window),
  Layer.provideMerge(SettingsStore.layer),
)

// Sessions and Power, both served by the coordinator
const Core = coordinatorSessions(app.getVersion()).pipe(Layer.provideMerge(Services))

const App = Layer.mergeAll(Ipc, AppIcon).pipe(
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
