// Sidebar session groups and their pure edits.

import { Schema } from "effect"
import { type GroupId, GroupId as GroupIdSchema, SessionId } from "./ids.ts"

export const GroupColor = Schema.Literals(["blue", "green", "amber", "rose", "violet", "teal"])
export type GroupColor = typeof GroupColor.Type
export const GROUP_COLORS = GroupColor.literals

export const SessionGroup = Schema.Struct({
  id: GroupIdSchema,
  name: Schema.String,
  color: GroupColor,
  collapsed: Schema.Boolean,
  members: Schema.Array(SessionId),
})
export type SessionGroup = typeof SessionGroup.Type

type Groups = ReadonlyArray<SessionGroup>

export const groupOf = (groups: Groups, id: SessionId) => groups.find((g) => g.members.includes(id))

// Groups need two members; smaller ones dissolve
const withoutMember = (groups: Groups, id: SessionId): Groups =>
  groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })).filter((g) => g.members.length > 1)

// Lowest Group n name not taken
const nextName = (groups: Groups) => {
  const taken = new Set(groups.map((g) => g.name))
  const n = Array.from({ length: groups.length + 1 }, (_, i) => i + 1).find((i) => !taken.has(`Group ${i}`))
  return `Group ${n}`
}

// Color least used so far, ties broken by pick
const freshColor = (groups: Groups, pick: (count: number) => number): GroupColor => {
  const uses = (c: GroupColor) => groups.filter((g) => g.color === c).length
  const fewest = Math.min(...GROUP_COLORS.map(uses))
  const options = GROUP_COLORS.filter((c) => uses(c) === fewest)
  return options[pick(options.length)] ?? "blue"
}

export interface NewGroup {
  readonly id: GroupId
  readonly pick: (count: number) => number
}

// Drops dragged onto target, joining target's group or forming one
export const dropOnSession = (groups: Groups, dragged: SessionId, target: SessionId, fresh: NewGroup): Groups => {
  if (dragged === target) {
    return groups
  }
  const existing = groupOf(groups, target)
  if (existing) {
    return dropOnGroup(groups, dragged, existing.id)
  }
  const rest = withoutMember(withoutMember(groups, dragged), target)
  const group: SessionGroup = { id: fresh.id, name: nextName(rest), color: freshColor(rest, fresh.pick), collapsed: false, members: [target, dragged] }
  return [...rest, group]
}

export const dropOnGroup = (groups: Groups, dragged: SessionId, id: GroupId): Groups => {
  if (groupOf(groups, dragged)?.id === id) {
    return groups
  }
  const target = groups.find((g) => g.id === id)
  if (!target) {
    return groups
  }
  const moved = groups.map((g) => (g.id === id ? { ...g, members: [...g.members, dragged] } : { ...g, members: g.members.filter((m) => m !== dragged) }))
  return moved.filter((g) => g.members.length > 1)
}

// Members limited to known sessions, without groups left under two
export const keepKnown = (groups: Groups, known: (id: SessionId) => boolean): Groups =>
  groups.map((g) => ({ ...g, members: [...new Set(g.members)].filter(known) })).filter((g) => g.members.length > 1)

export const ungroupSession = (groups: Groups, id: SessionId): Groups => withoutMember(groups, id)

export const dissolveGroup = (groups: Groups, id: GroupId): Groups => groups.filter((g) => g.id !== id)

export const editGroup = (groups: Groups, id: GroupId, patch: Partial<Pick<SessionGroup, "name" | "color" | "collapsed">>): Groups =>
  groups.map((g) => (g.id === id ? { ...g, ...patch } : g))

export const nextColor = (color: GroupColor): GroupColor => GROUP_COLORS[(GROUP_COLORS.indexOf(color) + 1) % GROUP_COLORS.length] ?? "blue"
