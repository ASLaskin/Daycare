// Everything Sessions needs from the window, so it never touches Electron
// directly: push an event to the renderer, show a notification, ask a question.

import { Context, type Effect } from "effect"
import type { EventChannel, Events } from "../shared/ipc.ts"

export class Ui extends Context.Service<
  Ui,
  {
    readonly send: <C extends EventChannel>(channel: C, payload: Events[C]) => void
    // Shown only while the window is not focused.
    readonly notify: (title: string, body: string) => void
    readonly confirm: (options: { readonly message: string; readonly detail: string; readonly confirmLabel: string }) => Effect.Effect<boolean>
  }
>()("daycare/Ui") {}
