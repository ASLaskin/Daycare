// Xterm instance with the app theme.

import { Terminal } from "@xterm/xterm"
import { monoFamily, termFontSize } from "./appearance.ts"

const THEME = {
  background: "#111316",
  foreground: "#e9ebee",
  cursor: "#e9ebee",
  cursorAccent: "#111316",
  selectionBackground: "#33405a",
  black: "#181b1f",
  brightBlack: "#5d646e",
  red: "#e5726b",
  brightRed: "#f08a84",
  green: "#5fd39a",
  brightGreen: "#7ee3b0",
  yellow: "#f2b84b",
  brightYellow: "#f6cb73",
  blue: "#7aa2ff",
  brightBlue: "#9bb9ff",
  magenta: "#c49bff",
  brightMagenta: "#d5b5ff",
  cyan: "#6fd3e0",
  brightCyan: "#92e2ec",
  white: "#c9ced6",
  brightWhite: "#ffffff",
}

export const createTerminal = () =>
  new Terminal({
    fontFamily: monoFamily(),
    fontSize: termFontSize(),
    lineHeight: 1.15,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: THEME,
  })
