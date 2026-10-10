import { el } from "../dom.ts"
import { onSessionsChanged } from "../store.ts"
import { sessionChats } from "./chats.ts"
import { renderAttachmentList } from "./list.ts"
import { attachmentPage } from "./page-state.ts"
import { onAttachmentsChanged } from "./store.ts"

const renderHead = () => {
  const session = attachmentPage.els?.session
  if (!session) {
    return
  }
  const [master, ...workers] = sessionChats()
  session.classList.toggle("quiet", !master)
  if (!master) {
    session.replaceChildren(el("span", "sr-session-name", "Open a chat"))
    return
  }
  const scope = workers.length ? `From this chat and ${workers.length} worker${workers.length === 1 ? "" : "s"}` : "From this chat"
  session.replaceChildren(el("span", "sr-session-label", scope), el("span", "sr-session-name", master.name || "Session"))
}

const render = () => {
  renderHead()
  renderAttachmentList()
}

// Files, folders and links from the active master and its workers
export const mountAttachmentsPage = (host: HTMLElement) => {
  const head = el("div", "sr-head")
  const session = el("div", "sr-session")
  head.append(session)
  const filters = el("div", "att-filters")
  filters.setAttribute("role", "group")
  filters.setAttribute("aria-label", "Show kind")
  const list = el("div", "att-list")
  host.append(head, filters, list)
  attachmentPage.els = { session, filters, list }
  render()
}

onSessionsChanged(render)
onAttachmentsChanged(renderAttachmentList)
