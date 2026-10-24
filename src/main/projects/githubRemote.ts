// GitHub web address for a git remote url.

import { asHttpUrl, type HttpUrl } from "../../shared/ids.ts"

const REMOTE = /^(?:git@github\.com:|(?:ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?|git:\/\/)github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

export const githubUrl = (remote: string): HttpUrl | null => {
  const match = REMOTE.exec(remote.trim())
  return match ? asHttpUrl(`https://github.com/${match[1]}/${match[2]}`) : null
}
