// New session popup form.

import { asDirPath } from "../shared/ids.ts"
import type { NewMaster, PermissionMode, Provider } from "../shared/session.ts"
import { api } from "./api.ts"
import { $, baseName, el, tildify } from "./dom.ts"
import { settings } from "./store.ts"

const sheet = () => $("#sheet")

const form = () => {
  const f = $<HTMLFormElement>("#master-form")
  const field = <T>(name: string) => f.elements.namedItem(name) as T
  return {
    form: f,
    task: field<HTMLTextAreaElement>("task"),
    name: field<HTMLInputElement>("name"),
    cwd: field<HTMLSelectElement>("cwd"),
    model: field<HTMLSelectElement>("model"),
    permissionMode: field<HTMLSelectElement>("permissionMode"),
    provider: field<HTMLSelectElement>("provider"),
  }
}

export const isSheetOpen = () => !sheet().classList.contains("hidden")
export const closeSheet = () => sheet().classList.add("hidden")
export const submitSheet = () => form().form.requestSubmit()

const folderOption = (label: string, path: string) => {
  const o = el("option", null, `${label}   ${tildify(path)}`)
  o.value = path
  return o
}

export const openSheet = (locIndex: number) => {
  const s = settings()
  const f = form()
  f.cwd.replaceChildren(...s.locations.map((l, i) => folderOption(`${i + 1}   ${l.label}`, l.path)))
  f.cwd.value = s.locations[locIndex]?.path ?? ""
  f.model.value = s.model
  f.permissionMode.value = s.permissionMode
  f.provider.value = s.provider
  sheet().classList.remove("hidden")
  f.task.focus()
}

const readForm = (): NewMaster => {
  const f = form()
  const name = f.name.value.trim()
  return {
    task: f.task.value.trim(),
    model: f.model.value,
    permissionMode: f.permissionMode.value as PermissionMode,
    provider: f.provider.value as Provider,
    cwd: asDirPath(f.cwd.value),
    ...(name ? { name } : {}),
  }
}

export const initSheet = () => {
  const f = form()
  $("#cancel").onclick = closeSheet
  $("#pick-cwd").onclick = async () => {
    const dir = await api.pickFolder()
    if (!dir) {
      return
    }
    f.cwd.append(folderOption(baseName(dir), dir))
    f.cwd.value = dir
  }
  sheet().addEventListener("mousedown", (e) => {
    if (e.target === sheet()) {
      closeSheet()
    }
  })
  f.form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const options = readForm()
    closeSheet()
    f.task.value = ""
    f.name.value = ""
    await api.createMaster(options)
  })
}
