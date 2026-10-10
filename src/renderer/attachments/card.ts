import type { Attachment, FileAttachment, UrlAttachment } from "../../shared/attachments.ts"
import { mediaUrl } from "../../shared/media.ts"
import { el, setText, tildify } from "../dom.ts"
import type { Row } from "../keyed.ts"
import type { SessionAttachment } from "./aggregate.ts"
import { openPath, openUrl, revealPath } from "./open.ts"

const button = (cls: string, text: string, onClick: () => void) => {
  const b = el("button", cls, text)
  b.type = "button"
  b.onclick = onClick
  return b
}

const label = (a: FileAttachment) => {
  const text = el("div", "att-text")
  text.append(el("div", "att-name", a.kind === "folder" ? `${a.name}/` : a.name), el("div", "att-sub", tildify(a.dir)))
  return text
}

const actions = (a: FileAttachment) => {
  const row = el("div", "att-actions")
  row.append(button("att-btn", "Open", () => void openPath(a.path)), button("att-btn", "Show in Finder", () => void revealPath(a.path)))
  return row
}

const thumb = (a: FileAttachment) => {
  const img = el("img", "att-thumb")
  img.src = mediaUrl(a.path)
  img.alt = a.name
  img.loading = "lazy"
  img.onerror = () => img.remove()
  img.onclick = () => void openPath(a.path)
  return img
}

// Still first frame, opened like an image
const videoThumb = (a: FileAttachment) => {
  const video = el("video", "att-thumb")
  video.src = `${mediaUrl(a.path)}#t=0.1`
  video.muted = true
  video.playsInline = true
  video.preload = "metadata"
  video.onerror = () => video.remove()
  video.onclick = () => void openPath(a.path)
  return video
}

const player = (a: FileAttachment) => {
  const audio = el("audio", "att-player")
  audio.src = mediaUrl(a.path)
  audio.controls = true
  audio.preload = "metadata"
  audio.onerror = () => audio.remove()
  return audio
}

const preview = (a: FileAttachment): ReadonlyArray<HTMLElement> => {
  switch (a.kind) {
    case "image":
      return [thumb(a)]
    case "video":
      return [videoThumb(a)]
    case "audio":
      return [player(a)]
    default:
      return []
  }
}

const folderCard = (a: FileAttachment) => {
  const card = button("att-card att-folder", "", () => void openPath(a.path))
  card.title = `Open ${a.path} in Finder`
  card.append(label(a))
  return card
}

const fileCard = (a: FileAttachment) => {
  const card = el("div", `att-card att-${a.kind}`)
  card.title = a.path
  card.append(...preview(a), label(a), actions(a))
  return card
}

const urlCard = (a: UrlAttachment) => {
  const card = button("att-card att-url", "", () => void openUrl(a.url))
  card.title = `Open ${a.url} in your browser`
  card.append(el("div", "att-host", a.host), el("div", "att-name", a.title), el("div", "att-sub", a.url))
  return card
}

const cardOf = (a: Attachment) => {
  if (a.kind === "url") {
    return urlCard(a)
  }
  return a.kind === "folder" ? folderCard(a) : fileCard(a)
}

// Card plus a label naming the chats it came from
export const attachmentCard = (item: SessionAttachment): Row<SessionAttachment> => {
  const node = cardOf(item.attachment)
  const from = el("div", "att-from")
  node.append(from)
  return {
    node,
    update: (next) => {
      setText(from, next.chats.join(", "))
    },
  }
}
