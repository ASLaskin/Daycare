import type { AttachmentFilter } from "../../shared/attachments.ts"

export interface AttachmentPageEls {
  readonly session: HTMLElement
  readonly filters: HTMLElement
  readonly list: HTMLElement
}

export const attachmentPage = {
  els: null as AttachmentPageEls | null,
  filter: "all" as AttachmentFilter,
}
