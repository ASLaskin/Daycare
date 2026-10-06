import type { SkillsListing, SkillSource } from "../../shared/skills.ts"

export interface Group {
  readonly key: SkillSource
  readonly label: string
  readonly note: string
}

export const GROUPS: ReadonlyArray<Group> = [
  { key: "personal", label: "Personal", note: "" },
  { key: "project", label: "Project", note: "" },
  { key: "plugin", label: "Plugins", note: "A plugin turns on or off as a whole, so the switch on one row changes every skill from that plugin." },
  { key: "synced", label: "Synced", note: "" },
  { key: "parked", label: "Parked", note: "Moved aside by hand into ~/.claude/skills-disabled. Restore puts a skill back where Claude can see it." },
]

export type Call = () => Promise<SkillsListing>
export type Sort = "tokens" | "name"

export interface ManagerEls {
  readonly host: HTMLElement
  readonly summary: HTMLElement
  readonly list: HTMLElement
  readonly warn: HTMLElement
  readonly foldBtn: HTMLButtonElement
  readonly sortBtns: Map<Sort, HTMLButtonElement>
}

export const mgr = {
  els: null as ManagerEls | null,
  query: "",
  sort: "tokens" as Sort,
  collapsed: new Set<string>(),
  rowErrors: new Map<string, string>(),
  groupErrors: new Map<string, string>(),
  busy: new Set<string>(),
}
