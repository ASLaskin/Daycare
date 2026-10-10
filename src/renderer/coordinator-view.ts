// Blocking screen while the coordinator is mismatched or unreachable.

import type { CoordinatorStatus } from "../shared/ipc.ts"
import { api } from "./api.ts"
import { el } from "./dom.ts"
import { toast } from "./toast.ts"

const message = (s: CoordinatorStatus): { readonly title: string; readonly body: string } | null => {
  switch (s.state) {
    case "mismatch":
      return {
        title: "Daycare and its coordinator are different versions",
        body: `Daycare ${s.app}, coordinator ${s.coordinator}. Running sessions continue until you restart the coordinator. Restarting interrupts any work in progress; you can continue each session afterwards.`,
      }
    case "unavailable":
      return { title: "Coordinator not reachable", body: `${s.message}. Daycare reconnects on its own once it is running.` }
    case "connecting":
    case "connected":
      return null
  }
}

export const initCoordinatorView = () => {
  const title = el("h2")
  const body = el("p")
  const restart = el("button", "primary small", "Restart coordinator")
  restart.hidden = true
  restart.onclick = () => {
    restart.disabled = true
    api
      .restartCoordinator()
      .catch((e: Error) => toast(`Restart failed: ${e.message}`))
      .finally(() => {
        restart.disabled = false
      })
  }
  const screen = el("div", "coordinator-block")
  screen.setAttribute("role", "alertdialog")
  screen.setAttribute("aria-live", "assertive")
  screen.hidden = true
  screen.append(title, body, restart)
  document.body.append(screen)

  api.onCoordinatorStatus((status) => {
    // Only coordinator mode sends status
    document.body.classList.add("coordinator")
    // Keep the last screen while retrying
    if (status.state === "connecting") {
      return
    }
    const shown = message(status)
    screen.hidden = shown === null
    title.textContent = shown?.title ?? ""
    body.textContent = shown?.body ?? ""
    restart.hidden = status.state !== "mismatch"
  })
}
