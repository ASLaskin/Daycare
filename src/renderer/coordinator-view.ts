// Blocking screen while the coordinator is mismatched or unreachable.

import type { CoordinatorStatus } from "../shared/ipc.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"

const message = (s: CoordinatorStatus): { readonly title: string; readonly body: string } | null => {
  switch (s.state) {
    case "mismatch":
      return {
        title: "Daycare and its coordinator are different versions",
        body: `Daycare ${s.app}, coordinator ${s.coordinator}. Running sessions continue. Restart the coordinator from this Daycare version, or update Daycare to match it.`,
      }
    case "unavailable":
      return { title: "Coordinator not reachable", body: `${s.message}. Start the coordinator; Daycare reconnects on its own.` }
    case "connecting":
    case "connected":
      return null
  }
}

export const initCoordinatorView = () => {
  const title = el("h2")
  const body = el("p")
  const screen = el("div", "coordinator-block")
  screen.setAttribute("role", "alertdialog")
  screen.setAttribute("aria-live", "assertive")
  screen.hidden = true
  screen.append(title, body)
  document.body.append(screen)

  api.onCoordinatorStatus((status) => {
    // Retries pass through connecting; keep the last screen until resolved
    if (status.state === "connecting") {
      return
    }
    const shown = message(status)
    screen.hidden = shown === null
    title.textContent = shown?.title ?? ""
    body.textContent = shown?.body ?? ""
  })
}
