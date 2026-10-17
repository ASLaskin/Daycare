// Error message without Electron's IPC prefix
export const messageOf = (err: unknown) => {
  const raw = String((err instanceof Error ? err.message : err) || "Something went wrong.")
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "")
}
