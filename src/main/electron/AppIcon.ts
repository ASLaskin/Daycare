// Dock icon only; Finder keeps the bundle's.

import { app } from "electron"
import { Effect, Layer, Stream } from "effect"
import path from "node:path"
import type { Settings } from "../../shared/settings.ts"
import { AppPaths } from "../AppPaths.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"
import { MainWindow } from "./Window.ts"

const ICONS = ["block", "sleepybot", "house"]

export const AppIcon = Layer.effectDiscard(
  Effect.gen(function* () {
    const { appRoot } = yield* AppPaths
    const { win } = yield* MainWindow
    const settings = yield* SettingsStore
    // Random picks once per launch.
    const random = ICONS[Math.floor(Math.random() * ICONS.length)]!
    let shown = ""
    const apply = (s: Settings) => {
      const name = ICONS.includes(s.appIcon) ? s.appIcon : random
      if (name === shown) return
      shown = name
      const file = path.join(appRoot, "assets", "brand", "logos", `${name}.png`)
      if (app.dock) app.dock.setIcon(file)
      else if (!win.isDestroyed()) win.setIcon(file)
    }
    apply(yield* settings.get)
    yield* settings.changes.pipe(
      Effect.flatMap((changes) => Stream.runForEach(changes, (s) => Effect.sync(() => apply(s)))),
      Effect.forkScoped,
    )
  }),
)
