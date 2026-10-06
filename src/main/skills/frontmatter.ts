// Minimal YAML subset for SKILL.md frontmatter: key: value, quoted values, > and
// | blocks, wrapped plain values, and "- item" lists. Anything it cannot read is
// ignored, never thrown. Pure, so it is tested on its own.

export type FrontmatterValue = string | ReadonlyArray<string>
export type Frontmatter = Readonly<Record<string, FrontmatterValue>>

const unquote = (raw: string): string => {
  const v = raw.trim()
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

const scalarOrInlineList = (raw: string): FrontmatterValue => {
  const v = raw.trim()
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map(unquote)
      .filter((x) => x !== "")
  }
  return unquote(v)
}

const indentOf = (line: string) => line.match(/^\s*/)![0].length
const isBlankOrIndented = (line: string) => line.trim() === "" || /^\s/.test(line)

export const parseFrontmatter = (text: string): { readonly data: Frontmatter; readonly hasFrontmatter: boolean } => {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")
  if (lines[0]?.trim() !== "---") return { data: {}, hasFrontmatter: false }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---")
  if (end === -1) return { data: {}, hasFrontmatter: false }

  const data: Record<string, FrontmatterValue> = {}
  const block = lines.slice(1, end)
  let i = 0
  while (i < block.length) {
    const line = block[i]!
    const m = /^([A-Za-z0-9_][\w.-]*)\s*:(.*)$/.exec(line)
    i++
    if (!m || /^\s/.test(line) || /^\s*#/.test(line)) continue
    const key = m[1]!
    const rest = m[2]!.trim()

    const blockMatch = /^([>|])([+-]?)\d*\s*$/.exec(rest)
    if (blockMatch) {
      const body: Array<string> = []
      while (i < block.length && isBlankOrIndented(block[i]!)) body.push(block[i++]!)
      while (body.length && body[body.length - 1]!.trim() === "") body.pop()
      const indents = body.filter((l) => l.trim() !== "").map(indentOf)
      const indent = indents.length ? Math.min(...indents) : 0
      const cut = body.map((l) => (l.trim() === "" ? "" : l.slice(indent))).join("\n")
      // Folded: single newlines become spaces, blank lines become newlines.
      data[key] = blockMatch[1] === ">" ? cut.replace(/([^\n])\n(?=[^\n])/g, "$1 ").replace(/\n{2}/g, "\n") : cut
      continue
    }

    if (rest === "") {
      const items: Array<string> = []
      while (i < block.length && (block[i]!.trim() === "" || /^\s*-(\s|$)/.test(block[i]!))) {
        const item = /^\s*-\s*(.*)$/.exec(block[i]!)
        if (item) items.push(unquote(item[1]!))
        i++
      }
      data[key] = items.length ? items : ""
      continue
    }

    // Plain or quoted value, possibly wrapped onto more indented lines.
    let value = rest
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : ""
    const closed = (v: string) => v.length >= 2 && v.endsWith(quote) && !v.endsWith("\\" + quote)
    while (i < block.length && /^\s+\S/.test(block[i]!) && (!quote || !closed(value))) {
      value += " " + block[i]!.trim()
      i++
    }
    data[key] = scalarOrInlineList(value)
  }
  return { data, hasFrontmatter: true }
}

// Frontmatter values as the listing reads them.
export const str = (v: FrontmatterValue | undefined): string =>
  typeof v === "string" ? v.trim() : Array.isArray(v) ? v.join(" ").trim() : ""
export const isTrue = (v: FrontmatterValue | undefined) => typeof v === "string" && v.trim().toLowerCase() === "true"
export const isFalse = (v: FrontmatterValue | undefined) => typeof v === "string" && v.trim().toLowerCase() === "false"
