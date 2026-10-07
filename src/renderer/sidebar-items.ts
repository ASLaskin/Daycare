// Sidebar entries for open and closed masters.

import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { baseName, el, setText } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { keyedRows, type Row, syncChildren } from "./keyed.ts"
import { masterActions } from "./session-actions.ts"
import { paintContext, paintName, paintStatus, renamable, showsContext } from "./sidebar-tags.ts"
import { workerRow } from "./sidebar-worker.ts"
import { closedInfo, workersOf } from "./state.ts"
import { settings } from "./store.ts"

export interface OpenView {
  readonly info: SessionView
  readonly active: boolean
}

// Closed masters get a still sprite frame.
const avatarSrc = (m: SessionView) => `icons/${m.icon}.${m.status === "closed" ? "png" : "gif"}`

// Avatar, name, and status shared by open and closed masters.
const masterShell = (current: () => SessionView) => {
  const item = el("div", "master-item")
  item.dataset["id"] = current().id
  const who = el("div", "who")
  const avatar = el("img", "avatar")
  avatar.alt = ""
  const name = renamable("name", current)
  name.title = "Double-click to rename"
  const status = el("span")
  const top = el("div", "top")
  top.append(who, status)
  item.append(top)
  item.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(current().id)
  }
  const update = (m: SessionView) => {
    const showAvatar = !!m.icon && settings().showIcons
    item.classList.toggle("no-avatar", !showAvatar)
    if (showAvatar && avatar.getAttribute("src") !== avatarSrc(m)) {
      avatar.src = avatarSrc(m)
    }
    syncChildren(who, showAvatar ? [avatar, name] : [name])
    paintName(name, m.name)
    paintStatus(status, m.status)
  }
  return { item, top, update }
}

const workerSummary = (workers: ReadonlyArray<SessionView>, done: number) => {
  const needs = workers.filter((w) => w.status === "needs_you").length
  const parts = [workers.length ? `${done} of ${workers.length} workers done` : "No workers yet"]
  return [...parts, ...(needs ? [`${needs} need you`] : [])].join(", ")
}

const openRow = (first: OpenView): Row<OpenView> => {
  let m = first.info
  const shell = masterShell(() => m)
  const meta = el("div", "meta")
  const summary = el("span")
  const ctx = el("span")
  const progress = el("div", "progress")
  const fill = el("span")
  progress.append(fill)
  const list = el("div", "worker-list")
  const workerRows = keyedRows((w: SessionView) => w.id, workerRow)
  // Close and Delete shown on the selected master.
  const actions = el("div", "item-actions")
  actions.append(...masterActions(m.id))
  shell.item.onclick = (e) => {
    if (e.detail < 2) {
      focusSession(m.id)
    }
  }
  const update = ({ info, active }: OpenView) => {
    m = info
    shell.update(m)
    shell.item.classList.toggle("active", active)
    const workers = workersOf(m.id)
    const done = workers.filter((w) => w.status === "done" || w.status === "exited").length
    setText(summary, workerSummary(workers, done))
    paintContext(ctx, m.context)
    syncChildren(meta, showsContext(m.context) ? [summary, ctx] : [summary])
    fill.style.width = `${workers.length ? (done / workers.length) * 100 : 0}%`
    syncChildren(list, workerRows(workers))
    syncChildren(shell.item, [shell.top, meta, ...(workers.length ? [progress, list] : []), ...(active ? [actions] : [])])
  }
  return { node: shell.item, update }
}

const closedMeta = (m: SessionView) => {
  const workers = [...closedInfo.values()].filter((w) => w.parentId === m.id).length
  const parts = [baseName(m.cwd), ...(workers ? [`${workers} worker${workers === 1 ? "" : "s"}`] : [])]
  return parts.filter(Boolean).join(", ")
}

const closedRow = (first: SessionView): Row<SessionView> => {
  let m = first
  const shell = masterShell(() => m)
  shell.item.classList.add("closed")
  shell.item.title = "Click to reopen"
  const meta = el("div", "meta")
  shell.item.append(meta)
  const del = el("button", "ghost delete", "Delete")
  del.title = "Remove this session for good"
  del.onclick = (e) => {
    e.stopPropagation()
    api.deleteSession(m.id)
  }
  shell.top.append(del)
  shell.item.onclick = (e) => {
    if (e.detail < 2) {
      api.reopenSession(m.id)
    }
  }
  const update = (next: SessionView) => {
    m = next
    shell.update(m)
    setText(meta, closedMeta(m))
  }
  return { node: shell.item, update }
}

export const openRows = keyedRows((v: OpenView) => v.info.id, openRow)
export const closedRows = keyedRows((m: SessionView) => m.id, closedRow)
