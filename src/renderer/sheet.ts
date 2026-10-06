import type { NewMaster, PermissionMode, SessionKind } from "../shared/session.ts"
import { api } from "./api.ts"
import { $, baseName, el, tildify } from "./dom.ts"
import { closeSettings } from "./settings-view.ts"
import { settings } from "./store.ts"

let currentLoc = 0

export const setCurrentLocation = (i: number) => {
  currentLoc = i
}

// Keeps the picked location valid after edits.
export const clampLocation = () => {
  const s = settings()
  if (currentLoc >= s.locations.length) currentLoc = Math.min(s.defaultLocation, s.locations.length - 1)
}

export const defaultKind = (): SessionKind => settings().sessionKind
export const otherKind = (): SessionKind => (defaultKind() === "chat" ? "terminal" : "chat")

export const locationOptions = (select: HTMLSelectElement, selected: number) => {
  select.replaceChildren()
  settings().locations.forEach((l, i) => {
    const o = el("option", null, `${i + 1}   ${l.label}`)
    o.value = String(i)
    o.title = l.path
    select.append(o)
  })
  select.value = String(selected)
}

export const renderLocationPickers = () => {
  locationOptions($<HTMLSelectElement>("#location"), currentLoc)
  const list = $("#empty-locations")
  list.replaceChildren()
  settings().locations.forEach((l, i) => {
    const b = el("button", "loc-button")
    b.append(el("span", null, l.label), el("span", "kbd", i < 9 ? `⌘${i + 1}` : ""))
    b.title = l.path
    b.onclick = () => newSession(i)
    list.append(b)
  })
}

export const renderKindButtons = () => {
  $("#new-master").textContent = `New ${defaultKind()}`
  const alt = $("#new-master-alt")
  alt.textContent = `New ${otherKind()}`
  alt.title = `Open a ${otherKind()} session instead (⇧⌘N)`
}

export const newSession = (locIndex = currentLoc, kind = defaultKind()) => {
  const s = settings()
  const loc = s.locations[locIndex]
  if (!loc) return
  currentLoc = locIndex
  $<HTMLSelectElement>("#location").value = String(locIndex)
  closeSettings()
  if (s.askOnNew) return openSheet(locIndex, kind)
  api.createMaster({ task: "", kind, cwd: loc.path, model: s.model, permissionMode: s.permissionMode })
}

// ---------- popup ----------

const sheet = () => $("#sheet")
const form = () => {
  const f = $<HTMLFormElement>("#master-form")
  const field = <T>(name: string) => f.elements.namedItem(name) as T
  return {
    form: f,
    task: field<HTMLTextAreaElement>("task"),
    name: field<HTMLInputElement>("name"),
    kind: field<HTMLSelectElement>("kind"),
    cwd: field<HTMLSelectElement>("cwd"),
    model: field<HTMLSelectElement>("model"),
    permissionMode: field<HTMLSelectElement>("permissionMode"),
  }
}

export const isSheetOpen = () => !sheet().classList.contains("hidden")
export const closeSheet = () => sheet().classList.add("hidden")
export const submitSheet = () => form().form.requestSubmit()

const openSheet = (locIndex: number, kind: SessionKind) => {
  const s = settings()
  const f = form()
  f.kind.value = kind
  f.cwd.replaceChildren()
  s.locations.forEach((l, i) => {
    const o = el("option", null, `${i + 1}   ${l.label}   ${tildify(l.path)}`)
    o.value = l.path
    f.cwd.append(o)
  })
  f.cwd.value = s.locations[locIndex]?.path ?? ""
  f.model.value = s.model
  f.permissionMode.value = s.permissionMode
  sheet().classList.remove("hidden")
  f.task.focus()
}

export const initSheet = () => {
  const f = form()
  $<HTMLSelectElement>("#location").onchange = (e) => {
    currentLoc = Number((e.target as HTMLSelectElement).value)
  }
  $("#new-master").onclick = () => newSession()
  $("#new-master-alt").onclick = () => newSession(currentLoc, otherKind())
  $("#cancel").onclick = closeSheet
  $("#pick-cwd").onclick = async () => {
    const dir = await api.pickFolder()
    if (!dir) return
    const o = el("option", null, `${baseName(dir)}   ${tildify(dir)}`)
    o.value = dir
    f.cwd.append(o)
    f.cwd.value = dir
  }
  sheet().addEventListener("mousedown", (e) => {
    if (e.target === sheet()) closeSheet()
  })
  f.form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const name = f.name.value.trim()
    const options: NewMaster = {
      task: f.task.value.trim(),
      kind: f.kind.value as SessionKind,
      model: f.model.value,
      permissionMode: f.permissionMode.value as PermissionMode,
      cwd: f.cwd.value,
      ...(name ? { name } : {}),
    }
    closeSheet()
    f.task.value = ""
    f.name.value = ""
    await api.createMaster(options)
  })
}
