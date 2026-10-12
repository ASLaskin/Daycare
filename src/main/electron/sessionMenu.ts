// Right click menu for a master or worker in the sidebar.

import { Effect } from "effect"
import { type BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron"
import type { SessionId } from "../../shared/ids.ts"
import type { SessionView } from "../../shared/session.ts"
import type { Ui } from "../Ui.ts"
import type { Sessions } from "../sessions/Sessions.ts"

const later = (effect: Effect.Effect<void>) => () => void Effect.runFork(effect)

// Close or reopen a master, archive a worker.
const closeItems = (sessions: Sessions["Service"], s: SessionView): Array<MenuItemConstructorOptions> => {
  if (s.role !== "master") {
    return s.archived
      ? [{ label: "Restore", click: later(sessions.unarchive(s.id)) }]
      : [{ label: "Archive", click: later(sessions.archive(s.id)) }]
  }
  if (s.status === "closed") {
    return [{ label: "Reopen", click: later(sessions.reopen(s.id)) }]
  }
  return [{ label: "Close", accelerator: "CmdOrCtrl+W", click: later(sessions.close(s.id)) }]
}

export const showSessionMenu = (sessions: Sessions["Service"], ui: Ui["Service"], win: BrowserWindow) => (id: SessionId) =>
  Effect.gen(function* () {
    const s = yield* sessions.get(id)
    if (!s) {
      return
    }
    Menu.buildFromTemplate([
      { label: "Rename", click: () => ui.send("session:begin-rename", { id }) },
      ...closeItems(sessions, s),
      { type: "separator" },
      { label: "Delete", click: later(sessions.remove(id)) },
    ]).popup({ window: win })
  })
