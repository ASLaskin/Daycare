// Splits streamed text into complete lines.

// Feed chunks; overflow fires when an unterminated line exceeds limit
export const lineSplitter = (limit: number, onLine: (line: string) => void, onOverflow: () => void) => {
  let pending = ""
  return (chunk: string) => {
    const parts = (pending + chunk).split("\n")
    pending = parts.pop() ?? ""
    if (pending.length > limit) {
      pending = ""
      onOverflow()
      return
    }
    parts.filter(Boolean).forEach(onLine)
  }
}
