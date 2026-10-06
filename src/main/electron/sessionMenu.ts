// Right click menu for a master in the sidebar.

import { Effect } from "effect"
import { type BrowserWindow, Menu } from "electron"
import type { SessionId } from "../../shared/ids.ts"
import type { Ui } from "../Ui.ts"
import type { Sessions } from "../sessions/Sessions.ts"

export const showSessionMenu = (sessions: Sessions["Service"], ui: Ui["Service"], win: BrowserWindow) => (id: SessionId) =>
  Effect.gen(function* () {
    const m = yield* sessions.get(id)
    if (!m || m.role !== "master") {
      return
    }
    const later = (effect: Effect.Effect<void>) => () => void Effect.runFork(effect)
    Menu.buildFromTemplate([
      { label: "Rename", click: () => ui.send("session:begin-rename", { id }) },
      m.status === "closed"
        ? { label: "Reopen", click: later(sessions.reopen(id)) }
        : { label: "Close", accelerator: "CmdOrCtrl+W", click: later(sessions.close(id)) },
      { type: "separator" },
      { label: "Delete", click: later(sessions.remove(id)) },
    ]).popup({ window: win })
  })
