// One session pane: header plus chat.

import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import * as chat from "./chat/index.ts"
import { renderContext } from "./context-meter.ts"
import { $, el } from "./dom.ts"
import { setFocused } from "./focus.ts"
import { applyLayout } from "./layout.ts"
import { beginRename } from "./rename.ts"
import { masterActions } from "./session-actions.ts"
import { renderSidebar } from "./sidebar.ts"
import { wireSplitHandle } from "./split-handle.ts"
import { type Pane, panes } from "./state.ts"
import { STATUS_LABEL } from "./status.ts"
import { settings } from "./store.ts"
import { toggleZoom, zoomButton } from "./zoom.ts"

const groupFor = (masterId: SessionId) => {
  const existing = document.getElementById(`group-${masterId}`)
  if (existing) {
    return existing
  }
  const g = el("section", "group hidden")
  g.id = `group-${masterId}`
  const handle = el("div", "split-handle")
  handle.title = "Drag to resize. Double-click to reset."
  wireSplitHandle(g, handle)
  g.append(el("div", "master-slot"), handle, el("div", "worker-grid"))
  applyLayout(g)
  $("#stage").append(g)
  return g
}

const buildHead = (info: SessionView) => {
  const head = el("div", "pane-head")
  const title = el("span", "title", info.name)
  const role = el("span", "role", info.role === "master" ? "Master" : "Worker")
  const status = el("span", "status")
  const activity = el("span", "activity")
  const ctx = el("span", "ctx")
  title.title = "Double-click to rename"
  const actions = el("div", "head-actions")
  actions.append(zoomButton(info.id), ...(info.role === "master" ? masterActions(info.id) : []))
  head.append(title, role, status, activity, ctx, actions)
  head.ondblclick = (e) => {
    if ((e.target as HTMLElement).closest("button, input, .ctx")) {
      return
    }
    if (settings().zoomDblClick) {
      toggleZoom(info.id)
    }
  }
  return { head, els: { title, status, activity, ctx } }
}

const place = (info: SessionView, pane: HTMLElement) => {
  if (info.role === "master") {
    groupFor(info.id).querySelector(".master-slot")!.append(pane)
    return
  }
  const g = groupFor(info.parentId!)
  g.querySelector(".worker-grid")!.append(pane)
  g.classList.add("has-workers")
  applyLayout(g)
}

// Replays the conversation after a reload.
const mountChat = (info: SessionView, host: HTMLElement) => {
  chat.mount(info, host)
  api
    .chatHistory(info.id)
    .then((events) => {
      if (events.length) {
        chat.hydrate(info.id, events)
      }
    })
    .catch(() => {})
}

export const createPane = (info: SessionView) => {
  const pane = el("div", "pane enter")
  pane.dataset["id"] = info.id
  const { head, els } = buildHead(info)
  const host = el("div", "pane-body")
  pane.append(head, host)
  pane.addEventListener("animationend", () => pane.classList.remove("enter"), { once: true })

  const p: Pane = { info, pane, els }
  panes.set(info.id, p)
  els.title.ondblclick = (e) => {
    e.stopPropagation()
    beginRename(els.title, info.id, p.info.name)
  }
  place(info, pane)

  mountChat(info, host)
  pane.addEventListener("mousedown", () => setFocused(info.id))
  pane.addEventListener("focusin", () => setFocused(info.id))
  applyStatus(p)
  return p
}

export const applyStatus = (p: Pane) => {
  const { status, activity } = p.info
  if (!p.els.title.querySelector("input")) {
    p.els.title.textContent = p.info.name
  }
  p.els.status.className = `status ${status}`
  p.els.status.textContent = STATUS_LABEL[status]
  p.els.activity.textContent = activity
  p.els.activity.title = activity
  p.pane.classList.toggle("needs_you", status === "needs_you")
  renderContext(p.els.ctx, p.info.context)
}

export const refreshContexts = () => {
  panes.forEach((p) => renderContext(p.els.ctx, p.info.context))
  renderSidebar()
}
