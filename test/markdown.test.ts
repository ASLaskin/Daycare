import { describe, expect, test } from "bun:test"
import { linkTarget, parseBlocks, parseInline } from "../src/shared/markdown.ts"

const MESSAGE = [
  "Ranked by `docs/FORMAT.md` rules: first twist on a proven parent (57, 61, 60), clear frame 1 promise, loop.",
  "",
  "Base: `/Users/andrew.laskin/Desktop/extracurriculars/physics-channel`",
  "",
  "| # | Short | Why |",
  "|---|---|---|",
  "| 1 | [trilives](file:///Users/andrew.laskin/Desktop/extracurriculars/physics-channel/nov%204/trilives/trilives.mp4) | Parent 57 triangle (2.2M) plus new stake: 3 lives |",
  "| 2 | [spikeball](file:///Users/x/spikeball.mp4) | Parent 61 spikes (2M), role swap twist |",
].join("\n")

describe("parseBlocks", () => {
  test("splits a leading paragraph from a table", () => {
    const blocks = parseBlocks(MESSAGE)
    expect(blocks.map((b) => b.kind)).toEqual(["para", "table"])
    const table = blocks[1]
    if (table?.kind !== "table") {
      throw new Error("expected table")
    }
    expect(table.head).toEqual(["#", "Short", "Why"])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]?.[2]).toBe("Parent 57 triangle (2.2M) plus new stake: 3 lives")
  })

  test("reads alignment and escaped pipes, pads short rows", () => {
    const blocks = parseBlocks("a | b | c\n:-- | :-: | --:\n1 \\| x | 2\n\nafter")
    const table = blocks[0]
    if (table?.kind !== "table") {
      throw new Error("expected table")
    }
    expect(table.align).toEqual(["left", "center", "right"])
    expect(table.rows).toEqual([["1 | x", "2", ""]])
    expect(blocks[1]).toEqual({ kind: "para", text: "after" })
  })

  test("a lone pipe line is not a table", () => {
    expect(parseBlocks("a | b\nplain")).toEqual([{ kind: "para", text: "a | b\nplain" }])
  })
})

describe("parseInline", () => {
  test("code, link, bold and italic", () => {
    expect(parseInline("a `x` [l](https://e.com) **b** *i*")).toEqual([
      { kind: "text", text: "a " },
      { kind: "code", text: "x" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://e.com", children: [{ kind: "text", text: "l" }] },
      { kind: "text", text: " " },
      { kind: "bold", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "i" }] },
    ])
  })

  test("code shields markup and unmatched markers stay text", () => {
    expect(parseInline("`[a](b)` 2 * 3 * 4")).toEqual([
      { kind: "code", text: "[a](b)" },
      { kind: "text", text: " 2 * 3 * 4" },
    ])
  })
})

describe("linkTarget", () => {
  test("file urls become decoded paths", () => {
    expect(linkTarget("file:///Users/a/nov%204/x.mp4")).toEqual({ kind: "path", path: "/Users/a/nov 4/x.mp4" })
  })

  test("http urls open in the browser", () => {
    expect(linkTarget("https://e.com/a")?.kind).toBe("url")
  })

  test("unsafe schemes and remote file hosts are rejected", () => {
    expect(linkTarget("javascript:alert(1)")).toBeNull()
    expect(linkTarget("file://host/etc/passwd")).toBeNull()
    expect(linkTarget("mailto:a@b.c")).toBeNull()
  })

  test("relative paths drop fragments", () => {
    expect(linkTarget("docs/FORMAT.md#L3")).toEqual({ kind: "path", path: "docs/FORMAT.md" })
  })
})
