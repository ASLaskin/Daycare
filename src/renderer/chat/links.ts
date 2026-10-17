import type { DirPath } from "../../shared/ids.ts"
import { tokenize } from "../../shared/mentions.ts"
import { openPath, openUrl } from "../attachments/open.ts"
import { resolvePaths } from "../attachments/resolve.ts"
import { el } from "../dom.ts"

const makeLink = (node: HTMLElement, title: string, open: () => void) => {
  node.classList.add("chat-link")
  node.tabIndex = 0
  node.setAttribute("role", "link")
  node.title = title
  node.onclick = (e) => {
    e.preventDefault()
    open()
  }
  node.onkeydown = (e) => {
    if (e.key === "Enter") {
      open()
    }
  }
}

// Path spans become links once main finds them on disk
const linkPaths = (spans: ReadonlyArray<HTMLElement>, cwd: DirPath) => {
  if (!spans.length) {
    return
  }
  void resolvePaths(cwd, spans.map((s) => s.textContent ?? "")).then((found) => {
    const byRaw = new Map(found.map((r) => [r.raw, r]))
    spans.forEach((span) => {
      const hit = byRaw.get(span.textContent ?? "")
      if (hit) {
        makeLink(span, hit.isDir ? "Open folder in Finder" : "Open file", () => void openPath(hit.path))
      }
    })
  })
}

// Text with urls and existing paths as clickable links
export const appendLinked = (parent: HTMLElement, text: string, cwd: DirPath) => {
  const parts = tokenize(text)
  const nodes = parts.map((part) => {
    switch (part.kind) {
      case "text":
        return document.createTextNode(part.text)
      case "url": {
        const a = el("span", null, part.text)
        makeLink(a, "Open in browser", () => void openUrl(part.url))
        return a
      }
      case "path":
        return el("span", "chat-path", part.text)
    }
  })
  parent.append(...nodes)
  linkPaths(nodes.filter((n): n is HTMLSpanElement => n instanceof HTMLSpanElement && n.classList.contains("chat-path")), cwd)
}
