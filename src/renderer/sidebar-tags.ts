// Patchable name, status, and context bits of sidebar rows.

import { accountLabel } from "../shared/accounts.ts"
import type { AccountId } from "../shared/ids.ts"
import type { SessionStatus, SessionView } from "../shared/session.ts"
import { contextLevel, fmtTokens, showContext } from "./context-meter.ts"
import { el, setClass, setText } from "./dom.ts"
import { beginRename } from "./rename.ts"
import { STATUS_LABEL } from "./status.ts"
import { settings } from "./store.ts"

export const paintStatus = (node: HTMLElement, status: SessionStatus) => {
  setClass(node, `status ${status}`)
  setText(node, STATUS_LABEL[status])
}

export const showsContext = (tokens: number) => tokens > 0 && showContext()

export const paintContext = (node: HTMLElement, tokens: number) => {
  setClass(node, `ctx-tag ${contextLevel(tokens)}`)
  setText(node, fmtTokens(tokens))
}

// Skips names mid rename.
export const paintName = (node: HTMLElement, name: string) => {
  if (!node.querySelector("input")) {
    setText(node, name)
  }
}

export const renamable = (cls: string, current: () => SessionView) => {
  const name = el("span", cls)
  name.ondblclick = (e) => {
    e.stopPropagation()
    const s = current()
    beginRename(name, s.id, s.name)
  }
  return name
}

// Account label, only once more than Default exists
export const accountTag = (id: AccountId): string | null => {
  const { accounts } = settings()
  return accounts.length ? accountLabel(accounts, id) : null
}
