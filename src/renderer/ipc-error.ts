// Error text without Electron's IPC prefix.
export const ipcMessage = (err: unknown, fallback: string) => {
  const raw = String((err instanceof Error ? err.message : err) || fallback)
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "") || fallback
}
