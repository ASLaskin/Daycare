// Sidebar group: colored bar holding masters and chats, collapsible to chips.

import { dissolveGroup, dropOnGroup, editGroup, groupOf, nextColor, type SessionGroup } from "../shared/groups.ts"
import type { SessionView } from "../shared/session.ts"
import { el, setText } from "./dom.ts"
import { focusSession } from "./focus.ts"
import { sessionGroups, updateGroups } from "./groups.ts"
import { keyedRows, type Row, syncChildren } from "./keyed.ts"
import { beginEdit } from "./rename.ts"
import { roleLabel } from "./role-label.ts"
import { dropZone } from "./sidebar-drag.ts"
import type { OpenView } from "./sidebar-items.ts"
import { paintMark, statusMark, wirePeek } from "./status-mark.ts"

export interface GroupView {
  readonly group: SessionGroup
  readonly members: ReadonlyArray<OpenView>
  readonly rows: ReadonlyArray<HTMLElement>
}

const chip = (first: OpenView): Row<OpenView> => {
  let m: SessionView = first.info
  const node = el("button", "group-chip")
  node.type = "button"
  const mark = statusMark(m)
  const name = el("span", "chip-name")
  const kind = el("span", "chip-kind")
  node.append(mark, name, kind)
  node.onclick = (e) => {
    e.stopPropagation()
    focusSession(m.id)
  }
  wirePeek(node, () => m)
  const update = (view: OpenView) => {
    m = view.info
    paintMark(mark, m)
    setText(name, m.name)
    setText(kind, roleLabel(m))
    node.classList.toggle("active", view.active)
  }
  return { node, update }
}

const textButton = (label: string, title: string, action: () => void) => {
  const b = el("button", "ghost group-action", label)
  b.type = "button"
  b.title = title
  b.onclick = (e) => {
    e.stopPropagation()
    action()
  }
  return b
}

const groupRow = (first: GroupView): Row<GroupView> => {
  let g = first.group
  const box = el("section", "session-group")
  const head = el("div", "group-head")
  const chevron = el("span", "group-chevron")
  const name = el("span", "group-name")
  name.title = "Double-click to rename"
  const count = el("span", "group-count")
  const actions = el("span", "group-actions")
  actions.append(
    textButton("Color", "Next color", () => updateGroups((gs) => editGroup(gs, g.id, { color: nextColor(g.color) }))),
    textButton("Ungroup", "Split this group back into single sessions", () => updateGroups((gs) => dissolveGroup(gs, g.id))),
  )
  head.append(chevron, name, count, actions)
  const body = el("div", "group-body")
  const chips = el("div", "group-chips")
  const chipRows = keyedRows((v: OpenView) => v.info.id, chip)
  head.onclick = () => updateGroups((gs) => editGroup(gs, g.id, { collapsed: !g.collapsed }))
  name.ondblclick = (e) => {
    e.stopPropagation()
    beginEdit(name, g.name, (next) => updateGroups((gs) => editGroup(gs, g.id, { name: next })))
  }
  dropZone(
    box,
    (id) => groupOf(sessionGroups(), id)?.id !== g.id,
    (id) => updateGroups((gs) => dropOnGroup(gs, id, g.id)),
  )
  const update = (view: GroupView) => {
    g = view.group
    box.dataset["color"] = g.color
    box.classList.toggle("group-folded", g.collapsed)
    box.classList.toggle("has-active", view.members.some((v) => v.active))
    head.title = g.collapsed ? "Expand group" : "Collapse group"
    if (!name.querySelector("input")) {
      setText(name, g.name)
    }
    setText(count, String(view.members.length))
    syncChildren(body, view.rows)
    syncChildren(chips, chipRows(view.members))
    syncChildren(box, [head, g.collapsed ? chips : body])
  }
  return { node: box, update }
}

export const groupRows = keyedRows((v: GroupView) => v.group.id, groupRow)
