// Theme editor groups and token labels.

import type { ThemeToken } from "../../shared/theme/palette.ts"

export interface TokenGroup {
  readonly label: string
  readonly tokens: ReadonlyArray<readonly [ThemeToken, string]>
}

export const TOKEN_GROUPS: ReadonlyArray<TokenGroup> = [
  {
    label: "Surfaces",
    tokens: [
      ["bg", "Background"],
      ["panel", "Panel"],
      ["panel-2", "Raised"],
      ["panel-3", "Hover"],
      ["line", "Border"],
      ["line-strong", "Border strong"],
      ["overlay", "Overlay"],
      ["shadow", "Shadow"],
    ],
  },
  {
    label: "Text",
    tokens: [
      ["text", "Text"],
      ["muted", "Muted"],
      ["faint", "Faint"],
    ],
  },
  {
    label: "Accent and status",
    tokens: [
      ["accent", "Accent"],
      ["working", "Working"],
      ["needs", "Needs input"],
      ["done", "Done"],
      ["exited", "Exited"],
    ],
  },
]
