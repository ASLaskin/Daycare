// Wording of the account switch and removal prompts.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const SWITCH_CHOICES = ["keep", "restart", "cancel"] as const
export type SwitchChoice = (typeof SWITCH_CHOICES)[number]

export const switchDialog = (running: number, label: string) => ({
  message: `Switch to ${label}?`,
  detail: [
    `${plural(running, "session")} ${running === 1 ? "is" : "are"} running on another account.`,
    `Keep: running sessions stay on their current account; new sessions use ${label}. Nothing is interrupted.`,
    `Restart: running sessions stop and resume on ${label} with their history. Any reply in progress is cut off.`,
  ].join("\n\n"),
  buttons: ["Keep running sessions", `Restart on ${label}`, "Cancel"],
  defaultId: 0,
  cancelId: 2,
})

export const switchChoice = (index: number): SwitchChoice => SWITCH_CHOICES[index] ?? "cancel"

export const removeDialog = (label: string, closed: number) => ({
  message: `Remove ${label}?`,
  detail: closed
    ? `Signs it out of Claude Code on this Mac. Its ${plural(closed, "closed session")} ${closed === 1 ? "moves" : "move"} to Default.`
    : "Signs it out of Claude Code on this Mac.",
  confirmLabel: "Remove",
})

export const inUseMessage = (label: string, running: number) =>
  `${plural(running, "session")} ${running === 1 ? "is" : "are"} running on ${label}. Close or switch ${running === 1 ? "it" : "them"} first.`
