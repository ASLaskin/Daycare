import type { SessionView } from "../shared/session.ts"
import { api } from "./api.ts"
import { $, baseName, el } from "./dom.ts"
import { contextLevel, fmtTokens, showContext } from "./meters.ts"
import { beginRename, isRenaming } from "./rename.ts"
import { focusSession, getActiveMaster, STATUS_LABEL } from "./sessions.ts"
import { closedInfo, panes, workersOf } from "./state.ts"
import { settings } from "./store.ts"

const ctxTag = (tokens: number) => el("span", `ctx-tag ${contextLevel(tokens)}`, fmtTokens(tokens))

const masterItem = (m: SessionView, active: boolean) => {
  const item = el("div", `master-item${active ? " active" : ""}`)
  item.dataset["id"] = m.id
  const top = el("div", "top")
  const who = el("div", "who")
  if (m.icon && settings().showIcons) {
    const img = el("img", "avatar")
    // A still frame once closed.
    img.src = `icons/${m.icon}.${m.status === "closed" ? "png" : "gif"}`
    img.alt = ""
    who.append(img)
  } else item.classList.add("no-avatar")
  const nameEl = el("span", "name", m.name)
  nameEl.title = "Double-click to rename"
  nameEl.ondblclick = (e) => {
    e.stopPropagation()
    beginRename(nameEl, m.id, m.name)
  }
  who.append(nameEl)
  top.append(who, el("span", `status ${m.status}`, STATUS_LABEL[m.status]))
  item.append(top)
  item.oncontextmenu = (e) => {
    e.preventDefault()
    api.sessionMenu(m.id)
  }
  return item
}

const openItem = (m: SessionView, active: string | null) => {
  const workers = workersOf(m.id)
  const done = workers.filter((w) => w.status === "done" || w.status === "exited").length
  const needs = workers.filter((w) => w.status === "needs_you").length
  const item = masterItem(m, m.id === active)

  const parts = [workers.length ? `${done} of ${workers.length} workers done` : "No workers yet"]
  if (needs) parts.push(`${needs} need you`)
  const meta = el("div", "meta", parts.join(", "))
  if (m.context && showContext()) meta.append(ctxTag(m.context))
  item.append(meta)

  if (workers.length) {
    const bar = el("div", "progress")
    const fill = el("span")
    fill.style.width = `${(done / workers.length) * 100}%`
    bar.append(fill)
    item.append(bar)

    const list = el("div", "worker-list")
    for (const w of workers) {
      const row = el("div", "worker-item")
      const name = el("span", "wname", w.name)
      name.ondblclick = (e) => {
        e.stopPropagation()
        beginRename(name, w.id, w.name)
      }
      const right = el("span", "wright")
      if (w.context && showContext()) right.append(ctxTag(w.context))
      right.append(el("span", `status ${w.status}`, STATUS_LABEL[w.status]))
      row.append(name, right)
      row.onclick = (e) => {
        e.stopPropagation()
        focusSession(w.id)
      }
      list.append(row)
    }
    item.append(list)
  }
  item.onclick = (e) => {
    if (e.detail < 2) focusSession(m.id)
  }
  return item
}

const closedItem = (m: SessionView) => {
  const item = masterItem(m, false)
  item.classList.add("closed")
  item.title = "Click to reopen"
  const workers = [...closedInfo.values()].filter((w) => w.parentId === m.id).length
  const parts = [baseName(m.cwd)]
  if (workers) parts.push(`${workers} worker${workers === 1 ? "" : "s"}`)
  item.append(el("div", "meta", parts.filter(Boolean).join(", ")))
  const del = el("button", "ghost delete", "Delete")
  del.title = "Remove this session for good"
  del.onclick = (e) => {
    e.stopPropagation()
    api.deleteSession(m.id)
  }
  item.querySelector(".top")!.append(del)
  item.onclick = (e) => {
    if (e.detail < 2) api.reopenSession(m.id)
  }
  return item
}

const newestFirst = (a: SessionView, b: SessionView) => b.createdAt - a.createdAt

export const renderSidebar = () => {
  if (isRenaming()) return
  const list = $("#master-list")
  list.replaceChildren()
  const active = getActiveMaster()
  const masters = [...panes.values()].map((p) => p.info).filter((i) => i.role === "master")
  for (const m of masters.sort(newestFirst)) list.append(openItem(m, active))

  const closed = [...closedInfo.values()].filter((i) => i.role === "master").sort(newestFirst)
  if (closed.length) list.append(el("div", "list-heading", "Closed"))
  for (const m of closed) list.append(closedItem(m))
}
