// Electron main process entry. Everything the app owns lives inside one Effect
// program, so quitting interrupts that program and every scoped resource
// (window, servers, child processes) is released by its own finalizer.

import { app, BrowserWindow } from "electron"
import { Effect, Fiber } from "effect"
import path from "node:path"

app.setName("Daycare")

// Bun bakes __dirname in at build time, so files are found from the app root,
// which is the package folder in dev and the bundle's app folder when packaged.
const dist = (...parts: Array<string>) => path.join(app.getAppPath(), "dist", ...parts)

const openWindow = Effect.acquireRelease(
  Effect.sync(() => {
    const win = new BrowserWindow({
      width: 1600,
      height: 1000,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: "#0b0c0e",
      titleBarStyle: "hiddenInset",
      webPreferences: {
        preload: dist("preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    win.loadFile(dist("renderer", "index.html"))
    return win
  }),
  (win) => Effect.sync(() => win.isDestroyed() || win.destroy()),
)

const program = Effect.gen(function* () {
  yield* Effect.promise(() => app.whenReady())
  yield* openWindow
  yield* Effect.log("Daycare is running")
  return yield* Effect.never
}).pipe(Effect.scoped)

const fiber = Effect.runFork(program)

// The first quit is held back until the program has unwound, then let through.
let unwound = false
app.on("before-quit", (event) => {
  if (unwound) return
  event.preventDefault()
  Effect.runPromise(Fiber.interrupt(fiber)).finally(() => {
    unwound = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
