import type { RailTab } from "../../shared/settings.ts"
import { mountAttachmentsPage } from "../attachments/page.ts"
import { focusSkillSearch, mountSkillsPage } from "../skills/rail.ts"

export interface RailPage {
  readonly id: RailTab
  readonly label: string
  readonly className: string
  readonly mount: (host: HTMLElement) => void
  readonly shown?: () => void
}

export const PAGES: ReadonlyArray<RailPage> = [
  { id: "skills", label: "Skills", className: "skill-rail", mount: mountSkillsPage, shown: focusSkillSearch },
  { id: "attachments", label: "Attachments", className: "att-rail", mount: mountAttachmentsPage },
]
