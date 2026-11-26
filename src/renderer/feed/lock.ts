// Overlay covering the feed while no agent is working.

import type { SessionId } from "../../shared/ids.ts"
import type { Activity } from "../agent-activity.ts"
import { el, setText } from "../dom.ts"

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'

interface LockCopy {
  readonly title: string
  readonly sub: string
}

const listNames = (names: ReadonlyArray<string>) => {
  if (names.length < 3) {
    return names.join(" and ")
  }
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

const copyFor = (activity: Activity, nameOf: (id: SessionId) => string): LockCopy => {
  switch (activity.kind) {
    case "needs-you":
      return { title: "An agent needs you", sub: `${listNames(activity.waiting.map(nameOf))} ${activity.waiting.length === 1 ? "is" : "are"} waiting on you.` }
    case "all-done":
      return { title: "All agents are done", sub: "Give them something new to unlock." }
    case "quiet":
      return { title: "Locked", sub: "Unlocks while an agent is working." }
    case "working":
      return { title: "", sub: "" }
  }
}

export const lockOverlay = () => {
  const node = el("div", "feed-lock")
  const icon = el("div", "feed-lock-icon")
  icon.innerHTML = LOCK_ICON
  const title = el("div", "feed-lock-title")
  const sub = el("div", "feed-lock-sub")
  node.append(icon, title, sub)
  // Swallow wheel so the page behind never scrolls
  node.addEventListener("wheel", (e) => e.preventDefault(), { passive: false })

  const paint = (activity: Activity, nameOf: (id: SessionId) => string) => {
    const copy = copyFor(activity, nameOf)
    node.dataset["kind"] = activity.kind
    setText(title, copy.title)
    setText(sub, copy.sub)
  }

  return { node, paint }
}
