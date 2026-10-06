// Sidebar entries for open and closed masters.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { contextLevel, fmtTokens, showContext } from "./context-meter.ts"
import { baseName, el } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { beginRename } from "./rename.ts"
import { closedInfo, workersOf } from "./state.ts"
import { STATUS_LABEL } from "./status.ts"
import { settings } from "./store.ts"

const ctxTag = (tokens: number) => el("span", `ctx-tag ${contextLevel(tokens)}`, fmtTokens(tokens))

const statusTag = (s: SessionView) => el("span", `status ${s.status}`, STATUS_LABEL[s.status])

const renamable = (cls: string, s: SessionView) => {
  const name = el("span", cls, s.name)
  name.ondblclick = (e) => {
    e.stopPropagation()
    beginRename(name, s.id, s.name)
  }
  return name
}

// Closed masters get a still sprite frame.
const avatar = (m: SessionView) => {
  const img = el("img", "avatar")
  img.src = `icons/${m.icon}.${m.status === "closed" ? "png" : "gif"}`
  img.alt = ""
  return img
}

const masterItem = (m: SessionView, active: boolean) => {
  const item = el("div", `master-item${active ? " active" : ""}`)
  item.dataset["id"] = m.id
  const who = el("div", "who")
  const showAvatar = !!m.icon && settings().showIcons
  if (showAvatar) {
    who.append(avatar(m))
  }
  item.classList.toggle("no-avatar", !showAvatar)
  const name = renamable("name", m)
  name.title = "Double-click to rename"
  who.append(name)
  const top = el("div", "top")
  top.append(who, statusTag(m))
  item.append(top)
  item.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(m.id)
  }
  return item
}

const workerRow = (w: SessionView) => {
  const row = el("div", "worker-item")
  const right = el("span", "wright")
  if (w.context && showContext()) {
    right.append(ctxTag(w.context))
  }
  right.append(statusTag(w))
  row.append(renamable("wname", w), right)
  row.onclick = (e) => {
    e.stopPropagation()
    focusSession(w.id)
  }
  return row
}

const progressBar = (fraction: number) => {
  const bar = el("div", "progress")
  const fill = el("span")
  fill.style.width = `${fraction * 100}%`
  bar.append(fill)
  return bar
}

const workerSummary = (workers: ReadonlyArray<SessionView>, done: number) => {
  const needs = workers.filter((w) => w.status === "needs_you").length
  const parts = [workers.length ? `${done} of ${workers.length} workers done` : "No workers yet"]
  return [...parts, ...(needs ? [`${needs} need you`] : [])].join(", ")
}

export const openItem = (m: SessionView, active: string | null) => {
  const workers = workersOf(m.id)
  const done = workers.filter((w) => w.status === "done" || w.status === "exited").length
  const item = masterItem(m, m.id === active)
  const meta = el("div", "meta", workerSummary(workers, done))
  if (m.context && showContext()) {
    meta.append(ctxTag(m.context))
  }
  item.append(meta)
  if (workers.length) {
    const list = el("div", "worker-list")
    list.append(...workers.map(workerRow))
    item.append(progressBar(done / workers.length), list)
  }
  item.onclick = (e) => {
    if (e.detail < 2) {
      focusSession(m.id)
    }
  }
  return item
}

export const closedItem = (m: SessionView) => {
  const item = masterItem(m, false)
  item.classList.add("closed")
  item.title = "Click to reopen"
  const workers = [...closedInfo.values()].filter((w) => w.parentId === m.id).length
  const parts = [baseName(m.cwd), ...(workers ? [`${workers} worker${workers === 1 ? "" : "s"}`] : [])]
  item.append(el("div", "meta", parts.filter(Boolean).join(", ")))
  const del = el("button", "ghost delete", "Delete")
  del.title = "Remove this session for good"
  del.onclick = (e) => {
    e.stopPropagation()
    api.deleteSession(m.id)
  }
  item.querySelector(".top")!.append(del)
  item.onclick = (e) => {
    if (e.detail < 2) {
      api.reopenSession(m.id)
    }
  }
  return item
}
