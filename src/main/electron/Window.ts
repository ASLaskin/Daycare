// The app window, as a scoped resource: created once Electron is ready,
// destroyed when the app scope closes. Loading the page is a separate step
// (see main.ts) so IPC handlers are in place before the renderer asks anything.

import { app, BrowserWindow } from "electron"
import { Context, Effect, Layer } from "effect"
import path from "node:path"
import { AppPaths } from "../AppPaths.ts"

export class MainWindow extends Context.Service<MainWindow, { readonly win: BrowserWindow }>()("daycare/MainWindow") {
  static readonly layer = Layer.effect(
    MainWindow,
    Effect.gen(function* () {
      const { appRoot } = yield* AppPaths
      yield* Effect.promise(() => app.whenReady())
      const win = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new BrowserWindow({
              width: 1600,
              height: 1000,
              minWidth: 900,
              minHeight: 600,
              backgroundColor: "#0b0c0e",
              titleBarStyle: "hiddenInset",
              webPreferences: {
                preload: path.join(appRoot, "dist", "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
              },
            }),
        ),
        (win) => Effect.sync(() => win.isDestroyed() || win.destroy()),
      )
      return MainWindow.of({ win })
    }),
  )
}
