// Folder menu for an unused chat: saved locations, then any folder.

import { Effect } from "effect"
import { type BrowserWindow, dialog, Menu } from "electron"
import { asDirPath, type DirPath } from "../../shared/ids.ts"
import type { Settings } from "../../shared/settings.ts"

const trimSlash = (p: string) => p.replace(/\/+$/, "") || p

const chooseFolder = (win: BrowserWindow, current: DirPath) =>
  dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath: current }).then((r) => {
    const picked = r.canceled ? undefined : r.filePaths[0]
    return picked ? asDirPath(picked) : null
  })

// Resolves with the picked folder, or null when dismissed.
export const showLocationMenu = (win: BrowserWindow, settings: Effect.Effect<Settings>) => (current: DirPath) =>
  Effect.gen(function* () {
    const { locations } = yield* settings
    return yield* Effect.callback<DirPath | null>((resume) => {
      let chosen = false
      const choose = (pick: () => Promise<DirPath | null>) => {
        chosen = true
        void pick().then((dir) => resume(Effect.succeed(dir)))
      }
      Menu.buildFromTemplate([
        ...locations.map((l) => ({
          label: l.label,
          sublabel: l.path,
          type: "checkbox" as const,
          checked: trimSlash(l.path) === trimSlash(current),
          click: () => choose(async () => l.path),
        })),
        ...(locations.length ? [{ type: "separator" as const }] : []),
        { label: "Choose folder...", click: () => choose(() => chooseFolder(win, current)) },
      ]).popup({
        window: win,
        // Clicks fire after close, so wait a tick before calling it dismissed
        callback: () => setTimeout(() => chosen || resume(Effect.succeed(null)), 0),
      })
    })
  })
