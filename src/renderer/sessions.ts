import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { SessionStatus, SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { monoFamily, termFontSize } from "./appearance.ts"
import * as chat from "./chat/index.ts"
import { $, el, tildify } from "./dom.ts"
import { applyLayout, wireSplitHandle } from "./layout.ts"
import { renderContext } from "./meters.ts"
import { beginRename, isRenaming } from "./rename.ts"
import { closeSettings } from "./settings-view.ts"
import { renderSidebar } from "./sidebar.ts"
import { closedInfo, type Pane, panes, scheduleFit, workersOf } from "./state.ts"
import { fireFocusChanged, settings } from "./store.ts"

export const STATUS_LABEL: Record<SessionStatus, string> = {
  starting: "Starting",
  idle: "Ready",
  working: "Working",
  needs_you: "Needs you",
  done: "Done",
  exited: "Exited",
  closed: "Closed",
}

const THEME = {
  background: "#111316",
  foreground: "#e9ebee",
  cursor: "#e9ebee",
  cursorAccent: "#111316",
  selectionBackground: "#33405a",
  black: "#181b1f",
  brightBlack: "#5d646e",
  red: "#e5726b",
  brightRed: "#f08a84",
  green: "#5fd39a",
  brightGreen: "#7ee3b0",
  yellow: "#f2b84b",
  brightYellow: "#f6cb73",
  blue: "#7aa2ff",
  brightBlue: "#9bb9ff",
  magenta: "#c49bff",
  brightMagenta: "#d5b5ff",
  cyan: "#6fd3e0",
  brightCyan: "#92e2ec",
  white: "#c9ced6",
  brightWhite: "#ffffff",
}

// Output that arrived before its pane existed.
const pending = new Map<string, Array<string>>()
let activeMaster: string | null = null
let focusedId: string | null = null
let zoomedId: string | null = null

export const getActiveMaster = () => activeMaster

export const focused = (): SessionView | null => (focusedId ? (panes.get(focusedId)?.info ?? null) : null)

// No submit, so the rail can add arguments.
export const insertIntoFocused = (text: string): boolean => {
  const p = focusedId ? panes.get(focusedId) : undefined
  if (!p) return false
  if (p.isChat) return chat.insert(p.info.id, text) !== false
  api.write(p.info.id, text)
  p.term?.focus()
  return true
}

// ---------- panes ----------

const ICONS = {
  zoom: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>',
  unzoom:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5h-4v-4M9.5 6.5L14 2M2.5 9.5h4v4M6.5 9.5L2 14"/></svg>',
}
const ZOOM_TITLE = "Zoom this pane (double-click the header)"

// Static markup only, never user text.
const iconButton = (name: keyof typeof ICONS, title: string) => {
  const b = el("button", `icon-btn icon-${name}`)
  b.type = "button"
  b.title = title
  b.innerHTML = ICONS[name]
  return b
}

const groupFor = (masterId: string) => {
  let g = document.getElementById(`group-${masterId}`)
  if (!g) {
    g = el("section", "group hidden")
    g.id = `group-${masterId}`
    const handle = el("div", "split-handle")
    handle.title = "Drag to resize. Double-click to reset."
    wireSplitHandle(g, handle)
    g.append(el("div", "master-slot"), handle, el("div", "worker-grid"))
    applyLayout(g)
    $("#stage").append(g)
  }
  return g
}

const createPane = (info: SessionView) => {
  const isChat = info.kind === "chat"
  const pane = el("div", `pane enter${isChat ? " chat-pane" : ""}`)
  pane.dataset["id"] = info.id
  const head = el("div", "pane-head")
  const title = el("span", "title", info.name)
  const role = el("span", "role", `${info.role === "master" ? "Master" : "Worker"}${isChat ? " chat" : ""}`)
  const status = el("span", "status")
  const activity = el("span", "activity")
  const ctx = el("span", "ctx")
  title.title = "Double-click to rename"
  head.append(title, role, status, activity, ctx)
  const actions = el("div", "head-actions")
  const zoom = iconButton("zoom", ZOOM_TITLE)
  zoom.onclick = (e) => {
    e.stopPropagation()
    toggleZoom(info.id)
  }
  actions.append(zoom)
  if (info.role === "master") {
    const close = el("button", "ghost", "Close")
    close.title = "Close this master and its workers, keeping them to reopen later (⌘W)"
    close.onclick = (e) => {
      e.stopPropagation()
      api.closeSession(info.id)
    }
    const del = el("button", "ghost danger", "Delete")
    del.title = "End this master and its workers and remove them"
    del.onclick = (e) => {
      e.stopPropagation()
      api.deleteSession(info.id)
    }
    actions.append(close, del)
  }
  head.append(actions)
  head.ondblclick = (e) => {
    if ((e.target as HTMLElement).closest("button, input, .ctx")) return
    if (settings().zoomDblClick) toggleZoom(info.id)
  }
  const host = el("div", "term")
  pane.append(head, host)
  pane.addEventListener("animationend", () => pane.classList.remove("enter"), { once: true })

  const term = isChat
    ? null
    : new Terminal({
        fontFamily: monoFamily(),
        fontSize: termFontSize(),
        lineHeight: 1.15,
        cursorBlink: true,
        allowProposedApi: true,
        scrollback: 5000,
        theme: THEME,
      })
  const fit = term ? new FitAddon() : null
  if (term && fit) term.loadAddon(fit)

  const p: Pane = { info, term, fit, pane, isChat, els: { title, status, activity, ctx } }
  panes.set(info.id, p)
  title.ondblclick = (e) => {
    e.stopPropagation()
    beginRename(title, info.id, p.info.name)
  }

  const g = groupFor(info.role === "master" ? info.id : info.parentId!)
  if (info.role === "master") g.querySelector(".master-slot")!.append(pane)
  else {
    g.querySelector(".worker-grid")!.append(pane)
    g.classList.add("has-workers")
    applyLayout(g)
  }

  if (term) {
    term.open(host)
    term.onData((d) => api.write(info.id, d))
    term.textarea?.addEventListener("focus", () => setFocused(info.id))
    new ResizeObserver(() => scheduleFit(p)).observe(host)
    const buffered = pending.get(info.id)
    if (buffered) {
      term.write(buffered.join(""))
      pending.delete(info.id)
    }
  } else {
    chat.mount(info, host)
    // After a reload main replays the conversation.
    api
      .chatHistory(info.id)
      .then((events) => {
        if (events.length) chat.hydrate(info.id, events)
      })
      .catch(() => {})
  }
  pane.addEventListener("mousedown", () => setFocused(info.id))
  // Tabbing into a composer retargets the rail too.
  pane.addEventListener("focusin", () => setFocused(info.id))

  applyStatus(p)
  return p
}

const applyStatus = (p: Pane) => {
  const { status, activity } = p.info
  if (!p.els.title.querySelector("input")) p.els.title.textContent = p.info.name
  p.els.status.className = `status ${status}`
  p.els.status.textContent = STATUS_LABEL[status]
  p.els.activity.textContent = activity
  p.els.activity.title = activity
  p.pane.classList.toggle("needs_you", status === "needs_you")
  renderContext(p.els.ctx, p.info.context)
}

export const refreshContexts = () => {
  for (const p of panes.values()) renderContext(p.els.ctx, p.info.context)
  renderSidebar()
}

// ---------- zoom ----------

export const isZoomed = () => zoomedId !== null

const toggleZoom = (id: string) => {
  const p = panes.get(id)
  if (!p) return
  const on = zoomedId !== id
  document.querySelectorAll(".pane.zoomed, .group.zoomed").forEach((x) => x.classList.remove("zoomed"))
  for (const x of panes.values()) {
    const btn = x.pane.querySelector(".icon-zoom")
    if (btn) {
      btn.innerHTML = ICONS.zoom
      ;(btn as HTMLElement).title = ZOOM_TITLE
    }
  }
  zoomedId = on ? id : null
  if (on) {
    p.pane.closest(".group")?.classList.add("zoomed")
    p.pane.classList.add("zoomed")
    const btn = p.pane.querySelector(".icon-zoom")
    if (btn) {
      btn.innerHTML = ICONS.unzoom
      ;(btn as HTMLElement).title = "Back to the layout (Esc)"
    }
  }
  for (const x of panes.values()) scheduleFit(x)
  focusSession(id)
}

// A running chat keeps Esc for interrupting.
export const unzoom = () => {
  if (!zoomedId) return
  if (panes.get(zoomedId)?.isChat && chat.isRunning(zoomedId)) return
  toggleZoom(zoomedId)
}

// ---------- focus ----------

const setFocused = (id: string) => {
  if (focusedId === id) return
  if (focusedId) panes.get(focusedId)?.pane.classList.remove("focused")
  focusedId = id
  panes.get(id)?.pane.classList.add("focused")
  fireFocusChanged()
}

export const focusSession = (id: string) => {
  const p = panes.get(id)
  if (!p) return
  closeSettings()
  showMaster(p.info.role === "master" ? p.info.id : p.info.parentId)
  requestAnimationFrame(() => {
    if (!isRenaming()) {
      if (p.isChat) chat.focus(id)
      else p.term?.focus()
    }
    setFocused(id)
  })
}

export const showMaster = (id: string | null) => {
  if (!id) return
  activeMaster = id
  document.querySelectorAll(".group").forEach((g) => g.classList.toggle("hidden", g.id !== `group-${id}`))
  $("#empty").style.display = "none"
  renderProjectActions()
  for (const p of panes.values()) if (p.info.id === id || p.info.parentId === id) scheduleFit(p)
  renderSidebar()
}

// ---------- removal ----------

const removePane = (id: string) => {
  const p = panes.get(id)
  if (!p) return
  if (zoomedId === id) {
    zoomedId = null
    p.pane.closest(".group")?.classList.remove("zoomed")
  }
  if (p.isChat) chat.dispose(id)
  else p.term?.dispose()
  p.pane.remove()
  panes.delete(id)
  // The rail names the focused session.
  if (focusedId === id) {
    focusedId = null
    fireFocusChanged()
  }
}

const removeSessionUI = ({ id, parentId }: { readonly id: string; readonly parentId: string | null }) => {
  const p = panes.get(id)
  if (!p) return renderSidebar()
  if (p.info.role === "master") {
    for (const w of workersOf(id)) removePane(w.id)
    removePane(id)
    document.getElementById(`group-${id}`)?.remove()
    if (activeMaster === id) {
      activeMaster = null
      const next = [...panes.values()].find((x) => x.info.role === "master")
      if (next) showMaster(next.info.id)
      else $("#empty").style.display = ""
    }
  } else {
    removePane(id)
    const g = parentId ? document.getElementById(`group-${parentId}`) : null
    if (g) {
      g.classList.toggle("has-workers", g.querySelector(".worker-grid")!.children.length > 0)
      applyLayout(g)
      for (const x of panes.values()) if (x.info.id === parentId || x.info.parentId === parentId) scheduleFit(x)
    }
  }
  renderProjectActions()
  renderSidebar()
}

// ---------- project actions ----------

const activeCwd = () => (activeMaster ? (panes.get(activeMaster)?.info.cwd ?? null) : null)

const renderProjectActions = () => {
  const cwd = activeCwd()
  $("#project-actions").classList.toggle("hidden", !cwd)
  const path = $("#project-path")
  path.textContent = cwd ? tildify(cwd) : ""
  path.title = cwd ?? ""
}

// ---------- events from main ----------

const addSession = (info: SessionView) => {
  if (info.status === "closed") {
    closedInfo.set(info.id, info)
    return false
  }
  closedInfo.delete(info.id)
  if (panes.has(info.id)) return false
  createPane(info)
  return true
}

const renameFromMenu = (id: string) => {
  const nameEl = document.querySelector<HTMLElement>(`.master-item[data-id="${id}"] .name`)
  const info = panes.get(id)?.info ?? closedInfo.get(id)
  if (nameEl && info) beginRename(nameEl, id, info.name)
}

export const closeActiveMaster = () => {
  if (activeMaster) api.closeSession(activeMaster)
}

export const initSessions = async () => {
  $("#open-vscode").onclick = () => {
    const d = activeCwd()
    if (d) api.openVSCode(d)
  }
  $("#open-finder").onclick = () => {
    const d = activeCwd()
    if (d) api.openFinder(d)
  }

  api.onRemoved((info) => {
    closedInfo.delete(info.id)
    for (const [id, c] of closedInfo) if (c.parentId === info.id) closedInfo.delete(id)
    removeSessionUI(info)
  })
  api.onCreated((info) => {
    if (addSession(info) && info.role === "master") focusSession(info.id)
    renderSidebar()
  })
  api.onUpdate((info) => {
    if (info.status === "closed") {
      closedInfo.set(info.id, info)
      if (panes.has(info.id)) removeSessionUI(info)
      else renderSidebar()
      return
    }
    const p = panes.get(info.id)
    if (!p) return
    // The rail shows the focused session's name and folder.
    const retarget = info.id === focusedId && (p.info.cwd !== info.cwd || p.info.name !== info.name)
    p.info = info
    applyStatus(p)
    renderSidebar()
    if (retarget) fireFocusChanged()
  })
  api.onBeginRename(({ id }) => renameFromMenu(id))
  api.onData(({ id, data }) => {
    const p = panes.get(id)
    if (p?.term) p.term.write(data)
    else if (!p) pending.set(id, [...(pending.get(id) ?? []), data])
  })
  api.onChatEvent(({ id, event }) => chat.event(id, event))

  // Rehydrate after a reload, masters first.
  const list = [...(await api.listSessions())]
  list.sort((a, b) => (a.role === "master" ? -1 : 1) - (b.role === "master" ? -1 : 1))
  for (const info of list) addSession(info)
  const first = list.find((i) => i.role === "master" && i.status !== "closed")
  if (first) showMaster(first.id)
  renderSidebar()
}
