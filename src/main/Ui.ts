// The window, as Sessions sees it.

import { Context, type Effect } from "effect"
import type { EventChannel, Events } from "../shared/ipc.ts"

export class Ui extends Context.Service<
  Ui,
  {
    readonly send: <C extends EventChannel>(channel: C, payload: Events[C]) => void
    // Only while the window is unfocused.
    readonly notify: (title: string, body: string) => void
    readonly confirm: (options: { readonly message: string; readonly detail: string; readonly confirmLabel: string }) => Effect.Effect<boolean>
  }
>()("daycare/Ui") {}
