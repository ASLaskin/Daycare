// Pairing token checks with a slowdown after repeated failures.

import { createHash, timingSafeEqual } from "node:crypto"
import type { PairingToken } from "../../shared/mobile.ts"

export const FAILURE_WINDOW_MS = 60_000
export const FAILURE_LIMIT = 5
export const PENALTY_MS = 5_000

const digest = (s: string) => createHash("sha256").update(s).digest()

// Constant time regardless of length
export const sameToken = (given: string, token: PairingToken) => timingSafeEqual(digest(given), digest(token))

// Bearer token from an Authorization header
export const bearer = (header: string | null) => {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")
  return m ? m[1]! : null
}

export const makeAuth = (token: () => PairingToken, now = Date.now) => {
  let failures: Array<number> = []

  const recent = () => {
    failures = failures.filter((t) => now() - t < FAILURE_WINDOW_MS)
    return failures.length
  }

  return {
    // Delay owed before answering, after too many failures
    delay: () => (recent() >= FAILURE_LIMIT ? PENALTY_MS : 0),

    check: (given: string | null) => {
      const ok = given !== null && sameToken(given, token())
      if (!ok) {
        failures.push(now())
      }
      return ok
    },
  }
}

export type Auth = ReturnType<typeof makeAuth>
