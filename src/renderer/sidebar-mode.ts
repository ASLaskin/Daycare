// Sidebar dropdown choosing active sessions or archived workers.

import { $ } from "./dom.ts"
import { renderSidebar } from "./sidebar.ts"

export type SidebarMode = "active" | "archived"

export const sidebarMode = { current: "active" as SidebarMode }

const picker = () => $<HTMLSelectElement>("#sidebar-mode")

// Archived option carries its count
export const paintSidebarMode = (archived: number) => {
  const option = picker().querySelector<HTMLOptionElement>('option[value="archived"]')
  if (option) {
    option.textContent = archived ? `Archived ${archived}` : "Archived"
  }
  picker().value = sidebarMode.current
}

export const setSidebarMode = (mode: SidebarMode) => {
  sidebarMode.current = mode
  renderSidebar()
}

export const initSidebarMode = () => {
  const select = picker()
  select.onchange = () => setSidebarMode(select.value === "archived" ? "archived" : "active")
}
