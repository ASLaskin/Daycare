import type { SkillRow, SkillsListing } from "../../shared/skills.ts"
import { api } from "../api.ts"

export const store: { data: SkillsListing | null; loadError: string } = { data: null, loadError: "" }

// Serial queue for skills calls
let queue: Promise<void> = Promise.resolve()

export const enqueue = <A>(fn: () => Promise<A>): Promise<A> => {
  const run = queue.then(fn)
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

const renderers: Array<() => void> = []
export const onRender = (fn: () => void) => void renderers.push(fn)
const renderAll = () => renderers.forEach((fn) => fn())

export const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US")
export const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`

// Error message without Electron's IPC prefix
export const messageOf = (err: unknown) => {
  const raw = String((err instanceof Error ? err.message : err) || "Something went wrong.")
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "")
}

export const applyResult = (result: SkillsListing) => {
  if (!Array.isArray(result?.skills)) {
    return
  }
  store.data = result
  store.loadError = ""
  renderAll()
}

export const refresh = () =>
  enqueue(() => api.listSkills()).then(applyResult, (err) => {
    store.loadError = messageOf(err)
    renderAll()
  })

const hayCache = new WeakMap<SkillRow, string>()

export const matches = (row: SkillRow, q: string) => {
  if (!q) {
    return true
  }
  let hay = hayCache.get(row)
  if (hay === undefined) {
    hay = `${row.name}\n${row.invoke}\n${row.description}\n${row.scope}\n${row.source}`.toLowerCase()
    hayCache.set(row, hay)
  }
  return hay.includes(q)
}
