// Every app keyboard shortcut and its default keys.

import { asKeyCombo, type KeyCombo } from "./combo.ts"

interface ShortcutDef {
  readonly id: string
  readonly label: string
  readonly hint?: string
  // First key is shown in labels
  readonly keys: ReadonlyArray<KeyCombo>
  // Handled outside the renderer and not rebindable
  readonly fixed?: boolean
}

const keys = (...combos: Array<string>) => combos.map(asKeyCombo)

const DEFINITIONS = [
  { id: "newSession", label: "New session", keys: keys("Mod+T", "Mod+N") },
  { id: "newSessionAt", label: "New session in location", hint: "Numbered as in General, Locations", keys: keys("Mod+Shift+#") },
  { id: "closeSession", label: "Close session", keys: keys("Mod+W"), fixed: true },
  { id: "nextSession", label: "Next session", keys: keys("Mod+Shift+]") },
  { id: "prevSession", label: "Previous session", keys: keys("Mod+Shift+[") },
  { id: "jumpAgent", label: "Focus agent", hint: "1 is the master, then its workers in order", keys: keys("Mod+#") },
  { id: "nextAgent", label: "Next agent", keys: keys("Ctrl+Tab") },
  { id: "prevAgent", label: "Previous agent", keys: keys("Ctrl+Shift+Tab") },
  { id: "zoomPane", label: "Zoom focused pane", keys: keys("Mod+Shift+Enter") },
  { id: "fullScreen", label: "Full screen window", keys: keys("Mod+Shift+F") },
  { id: "toggleAttachments", label: "Attachments panel", keys: keys("Mod+Shift+A") },
  { id: "toggleRail", label: "Side panel", keys: keys("Mod+/") },
  { id: "toggleSidebar", label: "Sidebar", keys: keys("Mod+B") },
  { id: "toggleSettings", label: "Settings", keys: keys("Mod+,") },
] as const satisfies ReadonlyArray<ShortcutDef>

export type ShortcutId = (typeof DEFINITIONS)[number]["id"]

export interface Shortcut extends ShortcutDef {
  readonly id: ShortcutId
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = DEFINITIONS

