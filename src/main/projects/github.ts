// Look up a folder's GitHub page from its origin remote.

import { execFile } from "node:child_process"
import type { DirPath, HttpUrl } from "../../shared/ids.ts"
import { githubUrl } from "./githubRemote.ts"

export const githubPage = (dir: DirPath) =>
  new Promise<HttpUrl | null>((resolve) => {
    execFile("git", ["remote", "get-url", "origin"], { cwd: dir }, (err, stdout) => {
      resolve(err ? null : githubUrl(stdout))
    })
  })
