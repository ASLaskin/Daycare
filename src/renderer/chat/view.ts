import type { SessionView } from "../../shared/session.ts"
import { el } from "../dom.ts"
import { button, wireToggle } from "./controls.ts"

// Static send icon markup
const SEND_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3.5M4 7.5L8 3.5l4 4"/></svg>'

const taskStrip = () => {
  const taskbar = el("div", "chat-tasks")
  taskbar.hidden = true
  const taskHead = button("chat-tasks-head")
  const taskSummary = el("span", "chat-tasks-summary")
  taskHead.append(el("span", "chat-chev", "›"), el("span", "chat-tasks-dot"), taskSummary)
  const taskList = el("div", "chat-tasks-list")
  wireToggle(taskHead, taskList)
  taskbar.append(taskHead, taskList)
  return { taskbar, taskList, taskSummary }
}

const transcript = () => {
  const scroll = el("div", "chat-scroll")
  scroll.tabIndex = -1
  scroll.setAttribute("role", "log")
  scroll.setAttribute("aria-label", "Conversation")
  const thread = el("div", "chat-thread")
  const working = el("div", "chat-working")
  working.hidden = true
  working.setAttribute("aria-label", "Working")
  working.append(el("span"), el("span"), el("span"))
  thread.append(working)
  scroll.append(thread)
  const jump = button("chat-jump", "Jump to latest")
  jump.hidden = true
  return { scroll, thread, working, jump }
}

const composer = () => {
  const wrap = el("div", "chat-composer")
  const box = el("div", "chat-box")
  const input = el("textarea", "chat-input")
  input.rows = 1
  input.placeholder = "Message this session"
  input.setAttribute("aria-label", "Message")
  const stop = button("chat-stop")
  stop.hidden = true
  stop.title = "Interrupt the current turn (Esc)"
  stop.setAttribute("aria-label", "Stop")
  stop.append(el("span", "chat-stop-sq"), el("span", "chat-stop-text", "Stop"))
  const send = button("chat-send")
  send.disabled = true
  send.title = "Send (Enter)"
  send.setAttribute("aria-label", "Send")
  send.innerHTML = SEND_ICON
  const actions = el("div", "chat-actions")
  actions.append(stop, send)
  box.append(input, actions)
  wrap.append(box, el("div", "chat-hint", "Enter to send, Shift+Enter for a new line"))
  return { composer: wrap, input, stop, send }
}

// Placeholder shown until the first real content
const emptyState = (info: SessionView) => {
  const empty = el("div", "chat-empty")
  empty.append(el("div", "chat-empty-title", info.name ? `New chat in ${info.name}` : "New chat"), el("div", "chat-empty-sub", info.cwd))
  return empty
}

// Build the chat pane DOM inside host
export const buildView = (info: SessionView, host: HTMLElement) => {
  const tasks = taskStrip()
  const log = transcript()
  const comp = composer()
  const foot = el("div", "chat-foot")
  foot.hidden = true
  const root = el("div", "chat")
  const wrap = el("div", "chat-scroll-wrap")
  wrap.append(log.scroll, log.jump)
  root.append(tasks.taskbar, wrap, comp.composer, foot)
  host.replaceChildren(root)
  const empty = emptyState(info)
  log.thread.prepend(empty)
  return { ...tasks, ...log, input: comp.input, stop: comp.stop, send: comp.send, foot, root, empty }
}
