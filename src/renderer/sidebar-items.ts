// Sidebar entries for open and closed masters.

import { iconFile, iconInPack } from "../shared/icons.ts"
import type { SessionId } from "../shared/ids.ts"
import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { baseName, el, setText } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { keyedRows, type Row, syncChildren } from "./keyed.ts"
import { masterActions } from "./session-actions.ts"
import { accountTag, paintContext, paintName, paintStatus, renamable, showsContext } from "./sidebar-tags.ts"
import { workerDot, workerRow } from "./sidebar-worker.ts"
import { closedInfo, workersOf } from "./state.ts"
import { settings } from "./store.ts"
import { doneCount, workerSummary } from "./worker-summary.ts"

export interface OpenView {
  readonly info: SessionView
  readonly active: boolean
}

// Closed masters get a still sprite frame.
const avatarSrc = (m: SessionView) => `icons/${iconFile(iconInPack(m.icon ?? "", settings().iconPack), m.status === "closed")}`

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

// Masters whose worker list shows as dots.
const folded = new Set<SessionId>()

const openRow = (first: OpenView): Row<OpenView> => {
  let current = first
  let m = first.info
  const shell = masterShell(() => m)
  const meta = el("div", "meta")
  const summary = el("span")
  const ctx = el("span")
  const acct = el("span", "acct-tag")
  const progress = el("div", "progress")
  const fill = el("span")
  progress.append(fill)
  const list = el("div", "worker-list")
  const workerRows = keyedRows((w: SessionView) => w.id, workerRow)
  const dots = el("div", "worker-dots")
  const workerDots = keyedRows((w: SessionView) => w.id, workerDot)
  // Close and Delete shown on the selected master.
  const actions = el("div", "item-actions")
  actions.append(...masterActions(m.id))
  shell.item.onclick = (e) => {
    if (e.detail < 2) {
      focusSession(m.id)
    }
  }
  const update = (view: OpenView) => {
    current = view
    m = view.info
    shell.update(m)
    shell.item.classList.toggle("active", view.active)
    const workers = workersOf(m.id)
    const isFolded = folded.has(m.id)
    setText(summary, workerSummary(m.id))
    paintContext(ctx, m.context)
    const account = accountTag(m.accountId)
    setText(acct, account ?? "")
    syncChildren(meta, [summary, ...(showsContext(m.context) ? [ctx] : []), ...(account ? [acct] : [])])
    meta.classList.toggle("foldable", workers.length > 0)
    meta.classList.toggle("folded", isFolded)
    meta.title = workers.length ? (isFolded ? "Show workers" : "Fold workers into dots") : ""
    fill.style.width = `${workers.length ? (doneCount(workers) / workers.length) * 100 : 0}%`
    syncChildren(list, isFolded ? [] : workerRows(workers))
    syncChildren(dots, isFolded ? workerDots(workers) : [])
    const body = workers.length ? [progress, isFolded ? dots : list] : []
    syncChildren(shell.item, [shell.top, meta, ...body, ...(view.active ? [actions] : [])])
  }
  meta.onclick = (e) => {
    if (!workersOf(m.id).length) {
      return
    }
    e.stopPropagation()
    if (!folded.delete(m.id)) {
      folded.add(m.id)
    }
    update(current)
  }
  return { node: shell.item, update }
}

const closedMeta = (m: SessionView) => {
  const workers = [...closedInfo.values()].filter((w) => w.parentId === m.id).length
  const account = accountTag(m.accountId)
  const parts = [baseName(m.cwd), ...(workers ? [`${workers} worker${workers === 1 ? "" : "s"}`] : []), ...(account ? [account] : [])]
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
