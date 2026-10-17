import { type AttachmentFilter, type AttachmentGroup, GROUPS, groupOf, matchesFilter } from "../../shared/attachments.ts"
import { el } from "../dom.ts"
import { keyedRows, syncChildren } from "../keyed.ts"
import type { SessionAttachment } from "./aggregate.ts"
import { attachmentCard } from "./card.ts"
import { sessionAttachments, sessionChats } from "./chats.ts"
import { attachmentPage } from "./page-state.ts"

const FILTERS: ReadonlyArray<{ readonly id: AttachmentFilter; readonly label: string }> = [{ id: "all", label: "All" }, ...GROUPS]

const emptyText = (all: ReadonlyArray<SessionAttachment>) => {
  if (!sessionChats().length) {
    return "Open a chat to see its files and links."
  }
  return all.length ? "Nothing of this kind yet." : "Files, folders and links from this chat and its workers show up here."
}

interface Section {
  readonly node: HTMLElement
  readonly title: HTMLElement
  readonly body: HTMLElement
}

const sectionsByGroup = new Map<AttachmentGroup, Section>()

const sectionFor = (group: AttachmentGroup): Section => {
  const hit = sectionsByGroup.get(group)
  if (hit) {
    return hit
  }
  const node = el("section", "att-group")
  const title = el("div", "att-group-title")
  const body = el("div", "att-group-body")
  node.append(title, body)
  const fresh = { node, title, body }
  sectionsByGroup.set(group, fresh)
  return fresh
}

// Cards are reused so playing media keeps playing
const cards = keyedRows<SessionAttachment>((s) => s.attachment.key, attachmentCard)

// Newest first, in kind sections
const sections = (shown: ReadonlyArray<SessionAttachment>): ReadonlyArray<HTMLElement> => {
  const byGroup = GROUPS.map((g) => ({ ...g, items: shown.filter((s) => groupOf(s.attachment) === g.id).reverse() }))
  const nodes = cards(byGroup.flatMap((g) => g.items))
  const nodeOf = new Map(byGroup.flatMap((g) => g.items).map((s, i) => [s.attachment.key, nodes[i]] as const))
  return byGroup
    .filter((g) => g.items.length)
    .map((g) => {
      const section = sectionFor(g.id)
      section.title.textContent = `${g.label} ${g.items.length}`
      syncChildren(section.body, g.items.flatMap((s) => nodeOf.get(s.attachment.key) ?? []))
      return section.node
    })
}

const renderFilters = (all: ReadonlyArray<SessionAttachment>) => {
  const els = attachmentPage.els
  if (!els) {
    return
  }
  const chips = FILTERS.map((f) => {
    const n = all.filter((s) => matchesFilter(s.attachment, f.id)).length
    const on = attachmentPage.filter === f.id
    const b = el("button", `att-filter${on ? " on" : ""}`, n ? `${f.label} ${n}` : f.label)
    b.type = "button"
    b.setAttribute("aria-pressed", String(on))
    b.onclick = () => {
      attachmentPage.filter = f.id
      renderAttachmentList()
    }
    return b
  })
  els.filters.replaceChildren(...chips)
}

export const renderAttachmentList = () => {
  const els = attachmentPage.els
  if (!els) {
    return
  }
  const all = sessionAttachments()
  const shown = all.filter((s) => matchesFilter(s.attachment, attachmentPage.filter))
  renderFilters(all)
  syncChildren(els.list, shown.length ? sections(shown) : [el("div", "sr-empty", emptyText(all))])
}
