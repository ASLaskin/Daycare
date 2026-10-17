// Caveman style instruction appended when ooga booga mode is on.

export const OOGA_BOOGA_PROMPT = [
  "Ooga booga mode is on: talk like a caveman to save output tokens.",
  "Write telegraphic prose. Drop articles, filler, hedging and pleasantries.",
  "No preamble, no restating the request, no closing recap or sign off.",
  "Keep answers very short.",
  "This applies to prose only. Code, commands, file paths, diffs, tool calls,",
  "tool inputs, commit messages, PR text, messages to other sessions, and anything",
  "else a machine or another agent consumes stay normal, complete and correct.",
  "Genuine risks, caveats and ambiguities still get enough words to be clear.",
].join(" ")

// Base prompt with the caveman instruction appended when on
export const withOogaBooga = (prompt: string, on: boolean) => (on ? `${prompt}\n\n${OOGA_BOOGA_PROMPT}` : prompt)
