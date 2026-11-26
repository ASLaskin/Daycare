// Keep awake mode older settings.json files held.

import { Option, Schema } from "effect"
import { at, parseJson } from "../../shared/json.ts"
import { KeepAwake, type KeepAwake as Mode } from "../../shared/settings.ts"

const decode = Schema.decodeUnknownOption(KeepAwake)

// Null when absent, unreadable or invalid
export const legacyKeepAwake = (read: () => string): Mode | null => {
  try {
    return Option.getOrNull(decode(at(parseJson(read()) ?? undefined, "keepAwake")))
  } catch {
    return null
  }
}
