import { describe, expect, test } from "bun:test"
import { asHttpUrl } from "../src/shared/ids.ts"
import { githubUrl } from "../src/main/projects/githubRemote.ts"

describe("githubUrl", () => {
  test("converts ssh and https remotes", () => {
    expect(githubUrl("git@github.com:acme/app.git\n")).toEqual(asHttpUrl("https://github.com/acme/app"))
    expect(githubUrl("https://github.com/acme/app.git")).toEqual(asHttpUrl("https://github.com/acme/app"))
    expect(githubUrl("ssh://git@github.com/acme/app")).toEqual(asHttpUrl("https://github.com/acme/app"))
    expect(githubUrl("https://user@github.com/acme/app/")).toEqual(asHttpUrl("https://github.com/acme/app"))
  })

  test("rejects other hosts", () => {
    expect(githubUrl("git@gitlab.com:acme/app.git")).toBeNull()
    expect(githubUrl("")).toBeNull()
  })
})
