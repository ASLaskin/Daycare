import type { Json, JsonObject } from "../../shared/json.ts"
import { button } from "./controls.ts"
import { oneLine, rec, str } from "./format.ts"
import type { CardParts } from "./perm-types.ts"

type Suggestion = JsonObject

const ruleLabel = (pick: Suggestion) => {
  const rules = pick["rules"]
  const r = Array.isArray(rules) ? rec(rules[0]) : null
  if (!r) {
    return "Allow and remember"
  }
  const what = r["ruleContent"] ? `${str(r["toolName"])}: ${oneLine(r["ruleContent"], 28)}` : str(r["toolName"])
  return `Always allow ${what}`
}

const modeLabel = (pick: Suggestion) => {
  const where = pick["destination"] === "session" || !pick["destination"] ? " this session" : ""
  return pick["mode"] === "acceptEdits" ? `Allow and accept edits${where}` : `Allow and switch to ${str(pick["mode"])}${where}`
}

const labelOf = (pick: Suggestion) => {
  switch (pick["type"]) {
    case "setMode":
      return modeLabel(pick)
    case "addRules":
      return ruleLabel(pick)
    default:
      return "Allow and remember"
  }
}

// The most useful permission suggestion with a plain label
const pickSuggestion = (list: ReadonlyArray<Json>) => {
  const items = list.map(rec).filter((x): x is Suggestion => x !== null)
  const mode = items.find((x) => x["type"] === "setMode" && x["mode"] === "acceptEdits") ?? items.find((x) => x["type"] === "setMode")
  const pick = mode ?? items.find((x) => x["type"] === "addRules") ?? items[0]
  if (!pick) {
    return null
  }
  return { label: labelOf(pick), update: pick }
}

// Add an allow and remember button when one is suggested
export const addAlt = (actions: HTMLElement, { ev, buttons, answer }: CardParts) => {
  const sug = pickSuggestion(ev.suggestions)
  if (!sug) {
    return
  }
  const alt = button("ghost chat-perm-alt", sug.label)
  actions.append(alt)
  buttons.push(alt)
  alt.addEventListener("click", () => answer({ allow: true, updatedPermissions: [sug.update] }, true, sug.label))
}
