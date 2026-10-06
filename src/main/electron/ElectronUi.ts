import { dialog, Notification } from "electron"
import { Effect, Layer } from "effect"
import { Ui } from "../Ui.ts"
import { MainWindow } from "./Window.ts"

export const ElectronUi = Layer.effect(
  Ui,
  Effect.gen(function* () {
    const { win } = yield* MainWindow
    return Ui.of({
      send: (channel, payload) => {
        if (!win.isDestroyed()) win.webContents.send(channel, payload)
      },
      notify: (title, body) => {
        if (!Notification.isSupported() || win.isFocused()) return
        new Notification({ title, body }).show()
      },
      confirm: ({ message, detail, confirmLabel }) =>
        Effect.promise(() =>
          dialog.showMessageBox(win, { type: "warning", buttons: [confirmLabel, "Cancel"], defaultId: 1, cancelId: 1, message, detail }),
        ).pipe(Effect.map(({ response }) => response === 0)),
    })
  }),
)
