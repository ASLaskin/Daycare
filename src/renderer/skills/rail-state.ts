import type { SkillRow } from "../../shared/skills.ts"
import { saveSettings, settings } from "../store.ts"

export interface RailEls {
  readonly root: HTMLElement
  readonly strip: HTMLButtonElement
  readonly session: HTMLElement
  readonly search: HTMLInputElement
  readonly list: HTMLElement
  readonly msg: HTMLElement
  readonly count: HTMLElement
}

export const RAIL_DEFAULT_WIDTH = 252

export const rail = {
  els: null as RailEls | null,
  query: "",
  activeId: null as string | null,
  visible: [] as ReadonlyArray<SkillRow>,
  msgTimer: 0 as ReturnType<typeof setTimeout> | 0,
  open: false,
  saving: 0,
}

export const saveRail = (patch: Parameters<typeof saveSettings>[0]) => saveSettings(patch).catch(() => settings())
