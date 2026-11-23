// Desktop pairing commands answered by the gateway.

import type { Json } from "../../shared/json.ts"
import type { CommandResult } from "../hub.ts"
import type { Route } from "../server.ts"
import type { Gateway } from "./gateway.ts"
import { messageOf } from "./outcome.ts"

const answer = (work: () => Json): Promise<CommandResult> => {
  try {
    return Promise.resolve({ result: work() })
  } catch (e) {
    return Promise.resolve({ error: messageOf(e) })
  }
}

// Null until the gateway exists
export const pairingRoute =
  (gateway: () => Gateway | null): Route =>
  (command) => {
    const g = gateway()
    switch (command.method) {
      case "pairing":
        return answer(() => (g ? g.pairing() : null))
      case "pairing-rotate":
        return g ? answer(g.rotate) : Promise.resolve({ error: "the phone gateway is starting" })
      case "pairing-setup":
        return g ? answer(g.setup) : Promise.resolve({ error: "the phone gateway is starting" })
      default:
        return null
    }
  }
