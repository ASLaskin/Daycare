// Confirm prompt for deleting every closed master.

export const deleteClosedPrompt = (count: number) => ({
  message: `Delete ${count} closed ${count === 1 ? "session" : "sessions"}?`,
  detail: "This removes them and their workers from Daycare for good.",
  confirmLabel: "Delete all",
})
