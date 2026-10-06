// VS Code and Finder buttons for the active master.

import type { DirPath } from "../shared/ids.ts"
import { api } from "./api.ts"
import { $, tildify } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { panes } from "./state.ts"

const activeCwd = () => {
  const id = getActiveMaster()
  return id ? (panes.get(id)?.info.cwd ?? null) : null
}

export const renderProjectActions = () => {
  const cwd = activeCwd()
  $("#project-actions").classList.toggle("hidden", !cwd)
  const path = $("#project-path")
  path.textContent = cwd ? tildify(cwd) : ""
  path.title = cwd ?? ""
}

const withCwd = (open: (dir: DirPath) => Promise<void>) => () => {
  const dir = activeCwd()
  if (dir) {
    open(dir)
  }
}

export const initProjectActions = () => {
  $("#open-vscode").onclick = withCwd(api.openVSCode)
  $("#open-finder").onclick = withCwd(api.openFinder)
}
