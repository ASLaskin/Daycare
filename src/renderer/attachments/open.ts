import type { FilePath, HttpUrl } from "../../shared/ids.ts"
import { api } from "../api.ts"
import { toast } from "../toast.ts"

const messageOf = (err: Error): string =>
  err.message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "") || "Could not open"

const report = (p: Promise<void>) => p.catch((err: Error) => toast(messageOf(err)))

export const openUrl = (url: HttpUrl) => report(api.openLink(url))
export const openPath = (path: FilePath) => report(api.openPath(path))
export const revealPath = (path: FilePath) => report(api.revealPath(path))
