import type { Json } from "../../shared/json.ts"
import { rec, str } from "./format.ts"

export interface Question {
  readonly text: string
  readonly header: string
  readonly hint: string
  readonly placeholder: string
  readonly multi: boolean
  readonly typed: boolean
  readonly options: ReadonlyArray<{ readonly label: string; readonly note: string }>
  readonly picked: Set<string>
  free: string
}

const optionOf = (o: Json) => {
  const r = rec(o)
  return r ? { label: String(r["label"] ?? ""), note: str(r["description"]) } : { label: String(o ?? ""), note: "" }
}

const questionOf = (item: Json): Question | null => {
  const q = rec(item)
  if (!q || typeof q["question"] !== "string" || !q["question"].trim()) {
    return null
  }
  const options = (Array.isArray(q["options"]) ? q["options"] : []).map(optionOf).filter((o) => o.label)
  // Text and number questions get a free field
  const typed = q["kind"] === "text" || q["kind"] === "number" || !options.length
  return {
    text: q["question"],
    header: str(q["header"]),
    hint: str(q["description"]),
    placeholder: str(q["placeholder"]),
    multi: q["multiSelect"] === true && !typed,
    typed,
    options,
    picked: new Set(),
    free: "",
  }
}

// Parse AskUserQuestion input, or null when malformed
export const askQuestions = (input: Json | undefined): Array<Question> | null => {
  const raw = rec(input)?.["questions"]
  if (!Array.isArray(raw) || !raw.length) {
    return null
  }
  const parsed = raw.map(questionOf)
  if (parsed.some((q) => q === null)) {
    return null
  }
  const out = parsed as Array<Question>
  // Reject duplicate question texts
  if (new Set(out.map((q) => q.text)).size !== out.length) {
    return null
  }
  return out
}
