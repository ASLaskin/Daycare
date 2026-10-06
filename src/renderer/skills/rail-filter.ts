import type { SkillRow } from "../../shared/skills.ts"
import { focused } from "../focus.ts"
import { matches, store } from "./state.ts"

// Project skills only run inside their own project
const isProjectScoped = (r: SkillRow) => r.source === "project" || r.id.startsWith("project-command:")

const inScope = (r: SkillRow, cwd: string | null) => {
  if (!isProjectScoped(r)) {
    return true
  }
  if (!cwd || !r.scope) {
    return false
  }
  return cwd === r.scope || cwd.startsWith(r.scope.replace(/\/+$/, "") + "/")
}

export const runnable = (r: SkillRow, cwd: string | null) =>
  r.userInvocable && (r.state === "on" || r.state === "user-invocable-only") && inScope(r, cwd)

export const focusedCwd = () => focused()?.cwd || null

// Runnable skills matching the query, sorted by command
export const railRows = (query: string) => {
  if (!store.data) {
    return []
  }
  const q = query.trim().toLowerCase()
  const cwd = focusedCwd()
  return store.data.skills
    .filter((r) => runnable(r, cwd) && matches(r, q))
    .sort((a, b) => a.invoke.localeCompare(b.invoke, undefined, { sensitivity: "base" }))
}
