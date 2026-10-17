// The main app window, destroyed with the app scope.

import { app, BrowserWindow } from "electron"
import { Context, Effect, Layer, Stream } from "effect"
import path from "node:path"
import type { Settings } from "../../shared/settings.ts"
import { activeTheme } from "../../shared/theme/themes.ts"
import { AppPaths } from "../AppPaths.ts"
import { SettingsStore } from "../settings/SettingsStore.ts"

const background = (s: Settings) => activeTheme(s).palette.bg

export class MainWindow extends Context.Service<MainWindow, { readonly win: BrowserWindow }>()("daycare/MainWindow") {
  static readonly layer = Layer.effect(
    MainWindow,
    Effect.gen(function* () {
      const { appRoot } = yield* AppPaths
      const settings = yield* SettingsStore
      const initial = yield* settings.get
      yield* Effect.promise(() => app.whenReady())
      const win = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new BrowserWindow({
              width: 1600,
              height: 1000,
              minWidth: 900,
              minHeight: 600,
              backgroundColor: background(initial),
              titleBarStyle: "hiddenInset",
              webPreferences: {
                preload: path.join(appRoot, "dist", "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
              },
            }),
        ),
        (win) =>
          Effect.sync(() => {
            if (!win.isDestroyed()) {
              win.destroy()
            }
          }),
      )
      // Window colour follows the theme
      yield* settings.changes.pipe(
        Effect.flatMap((changes) =>
          Stream.runForEach(changes, (s) =>
            Effect.sync(() => {
              if (!win.isDestroyed()) {
                win.setBackgroundColor(background(s))
              }
            }),
          ),
        ),
        Effect.forkScoped,
      )
      return MainWindow.of({ win })
    }),
  )
}
