import type { SkillRow } from "../../shared/skills.ts"
import { api } from "../api.ts"
import { el } from "../dom.ts"
import { renderList } from "./manager-list.ts"
import { type Call, type Group, mgr } from "./manager-state.ts"
import { applyResult, enqueue, messageOf, plural, store } from "./state.ts"

const GROUP_ERROR_MS = 10000
const ROW_ERROR_MS = 8000

// Run calls in order, stopping at the first failure
const runBulk = (groupKey: string, calls: ReadonlyArray<Call>) => {
  const busyKey = `g:${groupKey}`
  mgr.busy.add(busyKey)
  mgr.groupErrors.delete(groupKey)
  renderList()
  void enqueue(async () => {
    let done = 0
    try {
      for (const call of calls) {
        applyResult(await call())
        done++
      }
    } catch (err) {
      mgr.groupErrors.set(groupKey, `Stopped after ${done} of ${calls.length}: ${messageOf(err)}`)
      setTimeout(() => {
        mgr.groupErrors.delete(groupKey)
        renderList()
      }, GROUP_ERROR_MS)
    }
  }).then(() => {
    mgr.busy.delete(busyKey)
    renderList()
  })
}

// Run one row change, showing its error briefly
export const mutateRow = (row: SkillRow, call: Call) => {
  mgr.busy.add(row.id)
  mgr.rowErrors.delete(row.id)
  renderList()
  void enqueue(call)
    .then(applyResult, (err) => {
      mgr.rowErrors.set(row.id, messageOf(err))
      setTimeout(() => {
        mgr.rowErrors.delete(row.id)
        renderList()
      }, ROW_ERROR_MS)
    })
    .then(() => {
      mgr.busy.delete(row.id)
      renderList()
    })
}

const wantsChange = (r: SkillRow, enable: boolean) => (enable ? r.state === "off" : r.state !== "off")

// One call per plugin and per skill that would change
const turnCalls = (rows: ReadonlyArray<SkillRow>, enable: boolean): Array<Call> => {
  const seenPlugins = new Set<string>()
  return rows.flatMap((r): Array<Call> => {
    if (r.locked !== "plugin") {
      return wantsChange(r, enable) ? [() => api.setSkillState(r.id, enable ? "on" : "off")] : []
    }
    if (seenPlugins.has(r.scope)) {
      return []
    }
    seenPlugins.add(r.scope)
    const relevant = rows.some((x) => x.scope === r.scope && wantsChange(x, enable))
    return relevant ? [() => api.setSkillPlugin(r.id, enable)] : []
  })
}

const actionButton = (label: string, title: string, calls: ReadonlyArray<Call>, busy: boolean, run: () => void) => {
  const b = el("button", "ghost sm-quiet", label)
  b.type = "button"
  b.title = calls.length ? title : "Nothing to change here."
  b.disabled = busy || !calls.length
  b.onclick = run
  return b
}

// Bulk buttons in a group header
export const groupActions = (group: Group, rows: ReadonlyArray<SkillRow>, busy: boolean) => {
  const wrap = el("div", "sm-group-actions")
  const groupSize = store.data ? store.data.skills.filter((r) => r.source === group.key).length : 0
  const scope = rows.length === groupSize ? "in this group" : "shown here"
  if (group.key === "parked") {
    const calls = rows.map((r): Call => () => api.restoreSkill(r.id))
    const title = `Move the ${plural(rows.length, "parked skill", "parked skills")} ${scope} back into ~/.claude/skills.`
    wrap.append(actionButton("Restore all", title, calls, busy, () => runBulk(group.key, calls)))
    return wrap
  }
  const offCalls = turnCalls(rows, false)
  const onCalls = turnCalls(rows, true)
  const unit = group.key === "plugin" ? "plugins" : "skills"
  wrap.append(
    actionButton("Turn off", `Turn off the ${unit} ${scope} that are on. You can turn them back on.`, offCalls, busy, () => runBulk(group.key, offCalls)),
    actionButton("Turn on", `Turn on the ${unit} ${scope} that are off.`, onCalls, busy, () => runBulk(group.key, onCalls)),
  )
  return wrap
}
