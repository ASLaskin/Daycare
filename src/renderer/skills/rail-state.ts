import type { SkillRow } from "../../shared/skills.ts"

export interface RailEls {
  readonly session: HTMLElement
  readonly search: HTMLInputElement
  readonly list: HTMLElement
  readonly msg: HTMLElement
}

export const rail = {
  els: null as RailEls | null,
  query: "",
  activeId: null as string | null,
  visible: [] as ReadonlyArray<SkillRow>,
  msgTimer: 0 as ReturnType<typeof setTimeout> | 0,
}
