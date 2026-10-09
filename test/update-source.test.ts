import { describe, expect, test } from "bun:test"
import { parseUpdateSource } from "../src/main/updater/source.ts"

// Unbranded for comparing against literals
const parse = (input: string): { remote: string; ref: string; branch: string } | null => parseUpdateSource(input)

describe("parseUpdateSource", () => {
  test("empty means origin main", () => {
    expect(parse("  ")).toEqual({ remote: "origin", ref: "main", branch: "main" })
  })

  test("plain branch name uses origin", () => {
    expect(parse("feat/thing")).toEqual({ remote: "origin", ref: "feat/thing", branch: "feat/thing" })
  })

  test("tree link keeps slashes in the branch", () => {
    expect(parse("https://github.com/ASLaskin/Daycare/tree/feat/thing/")).toEqual({
      remote: "https://github.com/ASLaskin/Daycare.git",
      ref: "feat/thing",
      branch: "feat/thing",
    })
  })

  test("pr link fetches the pull head", () => {
    expect(parse("https://github.com/ASLaskin/Daycare/pull/12/files")).toEqual({
      remote: "https://github.com/ASLaskin/Daycare.git",
      ref: "pull/12/head",
      branch: "pr-12",
    })
  })

  test("repo link alone means main", () => {
    expect(parse("https://github.com/ASLaskin/Daycare")).toMatchObject({ ref: "main" })
  })

  test("rejects unsafe refs", () => {
    expect(parse("--upload-pack=x")).toBeNull()
    expect(parse("a..b")).toBeNull()
    expect(parse("a; rm -rf ~")).toBeNull()
    expect(parse("https://gitlab.com/a/b/tree/main")).toBeNull()
  })
})
