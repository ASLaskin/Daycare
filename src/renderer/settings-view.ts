import type { PowerStatus } from "../shared/power.ts"
import type { Settings } from "../shared/settings.ts"
import { api } from "./api.ts"
import { FONTS, MONOS, MOTIONS, SIDEBAR_WIDTH, termFontSize } from "./appearance.ts"
import { $, baseName, el, tildify } from "./dom.ts"
import { currentLayout, LAYOUTS, layoutDiagram, relayoutAll, setLayout, splitFor } from "./layout.ts"
import { showContext } from "./meters.ts"
import { getActiveMaster, refreshContexts } from "./sessions.ts"
import { defaultKind, locationOptions, setCurrentLocation } from "./sheet.ts"
import { renderSidebar } from "./sidebar.ts"
import * as skills from "./skills/index.ts"
import { workersOf } from "./state.ts"
import { saveSettings, settings } from "./store.ts"
import { toast } from "./toast.ts"

const input = (id: string) => $<HTMLInputElement>(`#${id}`)
const select = (id: string) => $<HTMLSelectElement>(`#${id}`)

const PANELS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "skills", label: "Skills" },
] as const
type Panel = (typeof PANELS)[number]["id"]
let activePanel: Panel = "general"

const view = () => $("#settings")
export const isSettingsOpen = () => !view().classList.contains("hidden")
export const closeSettings = () => view().classList.add("hidden")
export const openSettings = () => {
  renderSettings()
  renderTabs()
  view().classList.remove("hidden")
}
export const toggleSettings = () => (isSettingsOpen() ? closeSettings() : openSettings())

export const renderTabs = () => {
  const nav = $("#settings-tabs")
  nav.replaceChildren()
  for (const p of PANELS) {
    const b = el("button", p.id === activePanel ? "active" : null, p.label)
    b.onclick = () => showPanel(p.id)
    nav.append(b)
  }
}

const showPanel = (id: Panel) => {
  activePanel = id
  for (const p of PANELS) $(`#panel-${p.id}`).classList.toggle("hidden", p.id !== id)
  renderTabs()
  // Read from disk, so only while visible.
  if (id === "skills") skills.refresh()
}

interface Choice<T extends string> {
  readonly id: T
  readonly label: string
  readonly sub?: string
}

const segPicker = <T extends string>(host: HTMLElement, items: ReadonlyArray<Choice<T>>, current: string, onPick: (id: T) => void) => {
  host.replaceChildren()
  for (const it of items) {
    const b = el("button", null, it.label)
    b.type = "button"
    b.setAttribute("aria-pressed", String(it.id === current))
    b.onclick = () => onPick(it.id)
    host.append(b)
  }
}

const choicePicker = <T extends string>(
  host: HTMLElement,
  items: ReadonlyArray<Choice<T>>,
  current: string,
  onPick: (id: T) => void,
  decorate: (b: HTMLButtonElement, it: Choice<T>) => void,
) => {
  host.replaceChildren()
  for (const it of items) {
    const b = el("button", "choice")
    b.type = "button"
    b.setAttribute("aria-pressed", String(it.id === current))
    decorate(b, it)
    b.append(el("span", "choice-label", it.label))
    if (it.sub) b.append(el("span", "choice-sub", it.sub))
    b.onclick = () => onPick(it.id)
    host.append(b)
  }
}

export const renderSettings = () => {
  const s = settings()
  input("set-ask").checked = s.askOnNew
  input("set-random-names").checked = s.randomNames
  input("set-show-icons").checked = s.showIcons
  input("set-show-context").checked = showContext()
  select("set-session-kind").value = defaultKind()
  select("set-keep-awake").value = s.keepAwake
  input("set-keep-awake-lid").checked = s.keepAwakeLidClosed
  $("#keep-awake-lid-row").classList.toggle("collapsed", s.keepAwake === "off")
  $("#context-options").classList.toggle("collapsed", !showContext())
  select("set-app-icon").value = s.appIcon
  locationOptions(select("set-default-location"), s.defaultLocation)
  select("set-model").value = s.model
  select("set-permission").value = s.permissionMode
  select("set-context-limit").value = String(s.contextLimit)
  select("set-context-scale").value = String(s.contextScale)

  const root = document.documentElement.dataset
  segPicker($("#motion-picker"), MOTIONS, root["motion"] ?? "", (motion) => saveSettings({ motion }))
  choicePicker($("#font-picker"), FONTS, root["font"] ?? "", (font) => saveSettings({ font }), (b, it) => {
    b.dataset["font"] = it.id
    b.append(el("span", "font-sample", "The quick brown fox"))
  })
  choicePicker($("#mono-picker"), MONOS, root["mono"] ?? "", (monoFont) => saveSettings({ monoFont }), (b, it) => {
    b.dataset["mono"] = it.id
    b.append(el("span", "font-sample mono", "const x = { a: 0 };"))
  })
  input("set-term-size").value = String(termFontSize())
  $("#term-size-val").textContent = `${termFontSize()} px`

  const layout = currentLayout()
  choicePicker($("#layout-grid"), LAYOUTS, layout, setLayout, (b, it) => b.append(layoutDiagram(it.id)))
  const split = input("set-split")
  const active = getActiveMaster()
  const n = active ? workersOf(active).length : 1
  const grid = layout === "grid"
  split.disabled = grid
  split.value = String(splitFor(layout, Math.max(1, n)))
  $("#split-val").textContent = grid ? "even" : `${split.value}%`
  input("set-zoom-dblclick").checked = s.zoomDblClick
  select("set-max-cols").value = String(s.maxCols || 4)
  select("set-stage-gap").value = String(s.stageGap || 10)

  renderLocationRows()
}

const renderLocationRows = () => {
  const { locations } = settings()
  const rows = $("#location-rows")
  rows.replaceChildren()
  locations.forEach((l, i) => {
    const row = el("div", "location-row")
    const label = el("input")
    label.value = l.label
    label.onchange = () => updateLocation(i, { label: label.value.trim() || baseName(l.path) })
    const pathEl = el("span", "path", tildify(l.path))
    pathEl.title = l.path
    const choose = el("button", "ghost", "Change")
    choose.onclick = async () => {
      const dir = await api.pickFolder()
      if (dir) updateLocation(i, { path: dir })
    }
    const remove = el("button", "ghost", "Remove")
    remove.disabled = locations.length === 1
    remove.onclick = () => removeLocation(i)
    row.append(el("span", "num", i < 9 ? `⌘${i + 1}` : String(i + 1)), label, pathEl, choose, remove)
    rows.append(row)
  })
}

const updateLocation = (i: number, patch: Partial<Settings["locations"][number]>) =>
  saveSettings({ locations: settings().locations.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

const removeLocation = (i: number) => {
  const s = settings()
  let def = s.defaultLocation
  if (def === i) def = 0
  else if (def > i) def -= 1
  saveSettings({ locations: s.locations.filter((_, j) => j !== i), defaultLocation: def })
}

// Main drops values that do not decode.
const onSelect = (id: string, save: (value: string) => Promise<unknown>) => {
  select(id).onchange = (e) => save((e.target as HTMLSelectElement).value)
}
const onToggle = (id: string, save: (checked: boolean) => Promise<unknown>) => {
  input(id).onchange = (e) => save((e.target as HTMLInputElement).checked)
}

const wireFields = () => {
  $("#add-location").onclick = async () => {
    const dir = await api.pickFolder()
    if (dir) saveSettings({ locations: [...settings().locations, { label: baseName(dir), path: dir }] })
  }
  onToggle("set-ask", (askOnNew) => saveSettings({ askOnNew }))
  onToggle("set-random-names", (randomNames) => saveSettings({ randomNames }))
  onToggle("set-show-icons", (showIcons) => saveSettings({ showIcons }).then(renderSidebar))
  onToggle("set-show-context", (showContext) => saveSettings({ showContext }).then(refreshContexts))
  onToggle("set-keep-awake-lid", (keepAwakeLidClosed) => saveSettings({ keepAwakeLidClosed }))
  onToggle("set-zoom-dblclick", (zoomDblClick) => saveSettings({ zoomDblClick }))
  onSelect("set-default-location", (v) => {
    setCurrentLocation(Number(v))
    return saveSettings({ defaultLocation: Number(v) })
  })
  onSelect("set-model", (model) => saveSettings({ model }))
  onSelect("set-permission", (v) => saveSettings({ permissionMode: v as Settings["permissionMode"] }))
  onSelect("set-session-kind", (v) => saveSettings({ sessionKind: v as Settings["sessionKind"] }))
  onSelect("set-keep-awake", (v) => saveSettings({ keepAwake: v as Settings["keepAwake"] }))
  onSelect("set-app-icon", (v) => saveSettings({ appIcon: v as Settings["appIcon"] }))
  onSelect("set-context-limit", (v) => saveSettings({ contextLimit: Number(v) }).then(refreshContexts))
  onSelect("set-context-scale", (v) => saveSettings({ contextScale: Number(v) }).then(refreshContexts))
  onSelect("set-max-cols", (v) => saveSettings({ maxCols: Number(v) }).then(relayoutAll))
  onSelect("set-stage-gap", (v) => saveSettings({ stageGap: Number(v) }).then(relayoutAll))

  const size = input("set-term-size")
  size.oninput = () => ($("#term-size-val").textContent = `${size.value} px`)
  size.onchange = () => saveSettings({ termFontSize: Number(size.value) })

  const split = input("set-split")
  split.oninput = () => {
    $("#split-val").textContent = `${split.value}%`
    document.querySelectorAll<HTMLElement>(".group").forEach((g) => g.style.setProperty("--split", `${split.value}%`))
  }
  split.onchange = () =>
    saveSettings({ splits: { ...settings().splits, [currentLayout()]: Number(split.value) } }).then(relayoutAll)

  $("#reset-layout").onclick = () =>
    saveSettings({ splits: {}, sidebarWidth: SIDEBAR_WIDTH, railWidth: 252, stageGap: 10, maxCols: 4 }).then(() => {
      relayoutAll()
      toast("Sizes reset")
    })
  $("#open-settings").onclick = toggleSettings
  $("#close-settings").onclick = closeSettings
}

// ---------- update ----------

const renderUpdateInfo = async () => {
  const info = await api.updateInfo()
  const status = $("#update-status")
  if (!info) {
    status.textContent = "This build does not know its source folder. Rebuild once from the terminal."
    $<HTMLButtonElement>("#run-update").disabled = true
    return
  }
  const built = info.builtAt
    ? new Date(info.builtAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null
  status.textContent = info.commit
    ? `Built from ${info.commit}, ${built}. Pulls main, rebuilds, and restarts. Sessions resume.`
    : `Pulls main into ${tildify(info.sourceDir)} and rebuilds the installed app.`
}

const wireUpdate = () => {
  const btn = $<HTMLButtonElement>("#run-update")
  btn.onclick = async () => {
    const log = $("#update-log")
    btn.disabled = true
    btn.textContent = "Updating"
    log.textContent = ""
    log.classList.remove("hidden", "error")
    const stop = api.onUpdateLog((chunk) => {
      log.textContent += chunk
      log.scrollTop = log.scrollHeight
    })
    const res = await api.runUpdate()
    stop()
    log.textContent = res.log || log.textContent
    log.scrollTop = log.scrollHeight
    if (res.ok) btn.textContent = "Restarting"
    else {
      log.classList.add("error")
      btn.textContent = "Pull and rebuild"
      btn.disabled = false
    }
  }
  renderUpdateInfo()
}

// ---------- keep awake ----------

let power: PowerStatus | null = null

const renderPower = () => {
  if (!power) return
  const { mode, holding, lidClosedActive, error, busyCount, stale } = power
  const box = $("#power-state")
  const badge = $("#power-badge")
  box.classList.toggle("error", !!error)
  const working = `${busyCount} session${busyCount === 1 ? "" : "s"} working`
  const reason = mode === "always" ? "always on" : working
  box.textContent = error
    ? error
    : holding
      ? `Holding your Mac awake, ${reason}${lidClosedActive ? ", lid close included" : ""}.`
      : lidClosedActive
        ? "Sessions are done, lid close keeps the Mac awake a few more minutes."
        : `Not holding anything right now, ${working}.`
  $("#power-restore").classList.toggle("hidden", !stale)
  $("#power-dismiss").classList.toggle("hidden", !error || stale)
  badge.classList.toggle("hidden", !holding)
  badge.textContent = holding ? (lidClosedActive ? "Awake, lid closed" : "Keeping awake") : ""
  // A failed admin prompt must not leave the switch on.
  if (error && !stale && settings().keepAwakeLidClosed && !lidClosedActive) saveSettings({ keepAwakeLidClosed: false })
}

const wirePower = () => {
  const set = (st: PowerStatus) => {
    power = st
    renderPower()
  }
  const restore = $<HTMLButtonElement>("#power-restore")
  restore.onclick = async () => {
    restore.disabled = true
    try {
      set(await api.powerRestore())
    } finally {
      restore.disabled = false
    }
  }
  $("#power-dismiss").onclick = async () => set(await api.powerDismissError())
  api.powerStatus().then(set)
  api.onPower(set)
}

export const initSettingsView = () => {
  wireFields()
  wireUpdate()
  wirePower()
  renderTabs()
}
