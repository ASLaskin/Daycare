// Parses claude auth command output.

import { at, parseJson, str } from "../../shared/json.ts"

export interface AuthState {
  readonly loggedIn: boolean
  readonly email: string | null
}

export const parseAuthStatus = (text: string): AuthState => {
  const body = parseJson(text) ?? undefined
  return { loggedIn: at(body, "loggedIn") === true, email: str(at(body, "email")) }
}

const ESCAPES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[A-Za-z]/g

// Sign in page link printed by claude auth login
export const loginUrl = (output: string): string | null => output.match(/https:\/\/[^\s\x07\x1b]+/)?.[0] ?? null

// Last readable output line, for failure messages
export const lastLine = (output: string) =>
  output
    .replace(ESCAPES, "")
    .split("\n")
    .map((l) => l.trim())
    .findLast(Boolean) ?? ""
