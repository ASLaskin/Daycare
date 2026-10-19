// Menu under the plus button: upload image or drawing.

import { el } from "../dom.ts"
import { button } from "./controls.ts"
import { openPaint } from "./paint.ts"
import type { ChatSession } from "./types.ts"

export const wireAttachMenu = (s: ChatSession) => {
  const menu = el("div", "chat-attach-menu")
  menu.hidden = true
  menu.setAttribute("role", "menu")
  const entries: ReadonlyArray<readonly [string, () => void]> = [
    ["Upload image", () => s.picker.click()],
    ["Drawing", () => openPaint(s)],
  ]
  const close = () => {
    menu.hidden = true
    s.attach.setAttribute("aria-expanded", "false")
    document.removeEventListener("mousedown", onOutside, true)
  }
  const onOutside = (e: MouseEvent) => {
    if (!(e.target instanceof Node) || (!menu.contains(e.target) && !s.attach.contains(e.target))) {
      close()
    }
  }
  menu.append(
    ...entries.map(([label, run]) => {
      const item = button("chat-attach-item", label)
      item.setAttribute("role", "menuitem")
      item.addEventListener("click", () => {
        close()
        run()
      })
      return item
    }),
  )
  s.attach.setAttribute("aria-haspopup", "menu")
  s.attach.setAttribute("aria-expanded", "false")
  s.attach.addEventListener("click", () => {
    if (!menu.hidden) {
      close()
      return
    }
    menu.hidden = false
    s.attach.setAttribute("aria-expanded", "true")
    document.addEventListener("mousedown", onOutside, true)
  })
  s.box.append(menu)
}
