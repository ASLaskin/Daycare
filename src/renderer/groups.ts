// Sidebar groups mirrored from the coordinator.

import type { SessionGroup } from "../shared/groups.ts"
import { asGroupId } from "../shared/ids.ts"
import { api } from "./api.ts"
import { renderSidebar } from "./sidebar.ts"

type Groups = ReadonlyArray<SessionGroup>

let current: Groups = []

export const sessionGroups = () => current

const show = (next: Groups) => {
  current = next
  renderSidebar()
}

// Shows the edit at once; the coordinator echo confirms it
export const updateGroups = (edit: (groups: Groups) => Groups) => {
  const next = edit(current)
  show(next)
  return api.setGroups(next)
}

export const initGroups = async () => {
  api.onGroups(show)
  show(await api.listGroups())
}

export const freshGroup = () => ({
  id: asGroupId(crypto.randomUUID()),
  pick: (count: number) => Math.floor(Math.random() * count),
})
