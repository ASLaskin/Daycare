import type { RailTab } from "../../shared/settings.ts"
import { mountArchivedPage } from "../archived/page.ts"
import { mountAttachmentsPage } from "../attachments/page.ts"
import { mountFeedPage, setFeedVisible } from "../feed/feed.ts"
import { focusSkillSearch, mountSkillsPage } from "../skills/rail.ts"

// Rail controls a page may use
export interface RailControls {
  readonly wide: () => boolean
  readonly setWide: (wide: boolean) => void
}

export interface RailPage {
  readonly id: RailTab
  readonly label: string
  readonly className: string
  readonly mount: (host: HTMLElement, rail: RailControls) => void
  readonly shown?: () => void
  // Told whether the page is on screen after each change
  readonly visible?: (on: boolean) => void
}

export const PAGES: ReadonlyArray<RailPage> = [
  { id: "skills", label: "Skills", className: "skill-rail", mount: mountSkillsPage, shown: focusSkillSearch },
  { id: "attachments", label: "Attachments", className: "att-rail", mount: mountAttachmentsPage },
  { id: "archived", label: "Archived", className: "arc-rail", mount: mountArchivedPage },
  { id: "reels", label: "Reels", className: "feed-rail", mount: mountFeedPage, visible: setFeedVisible },
]
