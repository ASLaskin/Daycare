import type { RailTab } from "../../shared/settings.ts"
import { saveSettings, settings } from "../store.ts"

export interface SideRailEls {
  readonly root: HTMLElement
  readonly tabs: HTMLElement
  readonly bodies: ReadonlyMap<RailTab, HTMLElement>
}

export const RAIL_DEFAULT_WIDTH = 252

export const sideRail = {
  els: null as SideRailEls | null,
  open: false,
  tab: "skills" as RailTab,
  // Panel fills the work area beside the left sidebar
  wide: false,
  saving: 0,
}

export const saveRail = (patch: Parameters<typeof saveSettings>[0]) => saveSettings(patch).catch(() => settings())
