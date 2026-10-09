// Turns the update box input into a git remote, ref and local branch.

type GitRemote = string & { readonly __brand: "GitRemote" }
type GitRef = string & { readonly __brand: "GitRef" }

export interface UpdateSource {
  readonly remote: GitRemote
  readonly ref: GitRef
  readonly branch: GitRef
}

const ORIGIN = "origin" as GitRemote
const SAFE_REF = /^(?!-)(?!.*\.\.)[\w./-]+$/
const GITHUB = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(tree|pull)\/(.+?))?\/?$/

const asRef = (s: string) => (SAFE_REF.test(s) ? (s as GitRef) : null)

const fromGithub = (match: RegExpMatchArray): UpdateSource | null => {
  const [, owner, repo, kind, rest] = match
  const remote = `https://github.com/${owner}/${repo}.git` as GitRemote
  if (kind === "pull") {
    const pr = rest?.match(/^(\d+)/)?.[1]
    return pr ? { remote, ref: `pull/${pr}/head` as GitRef, branch: `pr-${pr}` as GitRef } : null
  }
  const ref = asRef(rest ?? "main")
  return ref ? { remote, ref, branch: ref } : null
}

// Empty means main; also takes a branch name, tree link or PR link.
export const parseUpdateSource = (input: string): UpdateSource | null => {
  const text = input.trim()
  if (!text) {
    return { remote: ORIGIN, ref: "main" as GitRef, branch: "main" as GitRef }
  }
  const github = text.match(GITHUB)
  if (github) {
    return fromGithub(github)
  }
  const ref = asRef(text)
  return ref ? { remote: ORIGIN, ref, branch: ref } : null
}
