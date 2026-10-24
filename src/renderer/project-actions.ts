// Top buttons for the active master: built in and custom.

import type { DirPath, HttpUrl } from "../shared/ids.ts"
import type { BuiltinButton } from "../shared/topButtons.ts"
import { api } from "./api.ts"
import { $, el, tildify } from "./dom.ts"
import { getActiveMaster } from "./focus.ts"
import { fileManagerName } from "./platform.ts"
import { panes } from "./state.ts"
import { onSettingsChanged, settings } from "./store.ts"

const githubPages = new Map<DirPath, HttpUrl | null>()

const activeCwd = () => {
  const id = getActiveMaster()
  return id ? (panes.get(id)?.info.cwd ?? null) : null
}

const button = (label: string, title: string, onClick: () => void) => {
  const b = el("button", "ghost", label)
  b.title = title
  b.onclick = onClick
  return b
}

const builtinButton = (id: BuiltinButton, cwd: DirPath) => {
  const github = githubPages.get(cwd)
  switch (id) {
    case "vscode":
      return button("VS Code", "Open this folder in VS Code", () => api.openVSCode(cwd))
    case "finder":
      return button(fileManagerName, `Show this folder in ${fileManagerName}`, () => api.openFinder(cwd))
    case "github":
      return github ? button("GitHub", `Open ${github} in the browser`, () => api.openUrl(github)) : null
  }
}

const ORDER: ReadonlyArray<BuiltinButton> = ["vscode", "github", "finder"]

const buttonsFor = (cwd: DirPath) => {
  const { hiddenButtons, customButtons } = settings()
  const builtin = ORDER.filter((id) => !hiddenButtons.includes(id)).map((id) => builtinButton(id, cwd))
  const custom = customButtons.map((c, index) =>
    button(c.label, `Run ${c.command}`, () => api.runCommand({ dir: cwd, index })),
  )
  return [...builtin, ...custom].filter((b) => b !== null)
}

const loadGithubPage = async (cwd: DirPath) => {
  githubPages.set(cwd, await api.githubPage(cwd))
  renderProjectActions()
}

export const renderProjectActions = () => {
  const cwd = activeCwd()
  $("#project-actions").classList.toggle("hidden", !cwd)
  const path = $("#project-path")
  path.textContent = cwd ? tildify(cwd) : ""
  path.title = cwd ?? ""
  if (cwd && !githubPages.has(cwd)) {
    githubPages.set(cwd, null)
    void loadGithubPage(cwd)
  }
  $("#project-buttons").replaceChildren(...(cwd ? buttonsFor(cwd) : []))
}

export const initProjectActions = () => {
  onSettingsChanged(renderProjectActions)
}
