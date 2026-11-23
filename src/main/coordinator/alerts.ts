// Desktop notifications and usage refreshes from live coordinator events.

import { Effect } from "effect"
import type { HubEvent } from "../../shared/coordinator.ts"
import type { SessionId } from "../../shared/ids.ts"
import type { SessionView } from "../../shared/session.ts"
import type { Ui } from "../Ui.ts"
import type { Usage } from "../usage/Usage.ts"

const FIRST_LINE_MAX = 90

export const firstLine = (text: string) => (text.split("\n").find((l) => l.trim()) ?? "").slice(0, FIRST_LINE_MAX)

interface AlertDeps {
  readonly ui: Ui["Service"]
  readonly usage: Usage["Service"]
  readonly session: (id: SessionId) => SessionView | undefined
}

export const makeAlerts = ({ ui, usage, session }: AlertDeps) => (event: HubEvent) => {
  if (event.kind === "approval") {
    const s = session(event.approval.session)
    const name = event.approval.event.kind === "permission" ? event.approval.event.name : "a tool"
    if (s) {
      ui.notify(`${s.name} needs you`, `Allow ${name}?`)
    }
    return
  }
  if (event.kind !== "chat" || event.event.kind !== "turn-end") {
    return
  }
  void Effect.runFork(usage.refresh())
  const s = session(event.session)
  if (s?.role === "master") {
    ui.notify(`${s.name} finished`, firstLine(event.event.text))
  }
}
