// Reels rail page with Instagram and YouTube, unlocked while agents work.

import { type FeedAccount, FEED_PAGES, type FeedPage } from "../../shared/feed.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { FeedTab } from "../../shared/settings.ts"
import { type Activity, deriveActivity, isUnlocked } from "../agent-activity.ts"
import { api } from "../api.ts"
import { el, setText } from "../dom.ts"
import type { RailControls } from "../side-rail/pages.ts"
import { openSessions, panes } from "../state.ts"
import { onSessionsChanged, onSettingsChanged, saveSettings, settings } from "../store.ts"
import { lockOverlay } from "./lock.ts"
import { type FeedView, feedView } from "./webview.ts"

const nameOf = (id: SessionId) => panes.get(id)?.info.name ?? "An agent"

interface FeedEls {
  readonly tabs: ReadonlyMap<FeedTab, HTMLButtonElement>
  readonly stack: HTMLElement
  readonly wide: HTMLButtonElement
  readonly lock: ReturnType<typeof lockOverlay>
}

const views = new Map<FeedTab, FeedView>()
const connected = new Map<FeedTab, boolean>()
let els: FeedEls | null = null
let activity: Activity = { kind: "quiet" }
let visible = false
let rail: RailControls | null = null

// Webviews load on first view
const viewFor = (page: FeedPage, stack: HTMLElement) => {
  const existing = views.get(page.id)
  if (existing) {
    return existing
  }
  const view = feedView(page, true)
  views.set(page.id, view)
  stack.append(view.node)
  return view
}

const apply = () => {
  if (!els) {
    return
  }
  const tab = settings().feedTab
  const unlocked = isUnlocked(activity)
  els.stack.classList.toggle("locked", !unlocked)
  els.tabs.forEach((b, id) => b.setAttribute("aria-pressed", String(id === tab)))
  const page = FEED_PAGES.find((p) => p.id === tab)
  if (visible && page) {
    viewFor(page, els.stack)
  }
  views.forEach((v, id) => {
    v.node.classList.toggle("on", id === tab)
    v.setHeld(!unlocked || !visible || id !== tab)
  })
  els.lock.paint(activity, nameOf)
  const wide = visible && (rail?.wide() ?? false)
  setText(els.wide, wide ? "Exit full screen" : "Full screen")
  els.wide.setAttribute("aria-pressed", String(wide))
}

const refresh = () => {
  activity = deriveActivity(openSessions())
  apply()
}

export const setFeedVisible = (on: boolean) => {
  visible = on
  apply()
}

// Pages reload when their site signs in or out
const onAccounts = (accounts: ReadonlyArray<FeedAccount>) => {
  accounts
    .filter((a) => connected.has(a.id) && connected.get(a.id) !== a.connected)
    .forEach((a) => views.get(a.id)?.reload())
  accounts.forEach((a) => connected.set(a.id, a.connected))
}

const tabButton = (page: FeedPage) => {
  const b = el("button", null, page.label)
  b.type = "button"
  b.onclick = () => void saveSettings({ feedTab: page.id })
  return b
}

const wideButton = () => {
  const b = el("button", "ghost feed-wide", "Full screen")
  b.type = "button"
  b.onclick = () => rail?.setWide(!rail.wide())
  return b
}

const exitWideOnEscape = (e: KeyboardEvent) => {
  if (e.key === "Escape" && visible && rail?.wide()) {
    rail.setWide(false)
  }
}

export const mountFeedPage = (host: HTMLElement, controls: RailControls) => {
  rail = controls
  const tabs = new Map(FEED_PAGES.map((p) => [p.id, tabButton(p)] as const))
  const seg = el("div", "seg feed-tabs")
  seg.setAttribute("role", "group")
  seg.setAttribute("aria-label", "Feed")
  seg.append(...tabs.values())
  const wide = wideButton()
  const head = el("div", "feed-head")
  head.append(seg, wide)
  const stack = el("div", "feed-stack")
  const lock = lockOverlay()
  stack.append(lock.node)
  const area = el("div", "feed-area")
  area.append(stack)
  host.append(head, area)
  els = { tabs, stack, wide, lock }
  document.addEventListener("keydown", exitWideOnEscape)
  onSettingsChanged(apply)
  onSessionsChanged(refresh)
  api.onFeedAccounts(onAccounts)
  void api.feedAccounts().then(onAccounts)
  refresh()
}
