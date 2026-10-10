import type { ResolvedPath } from "../../shared/attachments.ts"
import type { DirPath } from "../../shared/ids.ts"
import { api } from "../api.ts"

// Only hits are cached; a missing path may be written later
const hits = new Map<string, ResolvedPath>()

const keyOf = (cwd: DirPath, raw: string) => `${cwd}\0${raw}`

// Mentioned paths that exist on disk, checked by main
export const resolvePaths = async (cwd: DirPath, raws: ReadonlyArray<string>): Promise<ReadonlyArray<ResolvedPath>> => {
  const cached = raws.flatMap((raw) => hits.get(keyOf(cwd, raw)) ?? [])
  const unknown = raws.filter((raw) => !hits.has(keyOf(cwd, raw)))
  if (!unknown.length) {
    return cached
  }
  const found = await api.resolvePaths({ cwd, paths: unknown }).catch((): ReadonlyArray<ResolvedPath> => [])
  found.forEach((r) => hits.set(keyOf(cwd, r.raw), r))
  return [...cached, ...found]
}
