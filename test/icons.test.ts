import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { nextIcon } from "../src/main/sessions/naming.ts"
import { ICON_PACKS, iconFile, iconInPack } from "../src/shared/icons.ts"
import { baseSettings, mergeSettings, type Settings } from "../src/shared/settings.ts"
import { asDirPath } from "../src/shared/ids.ts"

const icons = path.join(import.meta.dir, "../assets/icons")

describe("icon packs", () => {
  test("every pokemon has a png and gif pair", () => {
    ICON_PACKS.pokemon.forEach((id) => {
      expect(fs.existsSync(path.join(icons, `${id}.png`))).toBe(true)
      expect(fs.existsSync(path.join(icons, `${id}.gif`))).toBe(true)
    })
  })

  test("pokemon list covers every gif on disk", () => {
    const onDisk = fs.readdirSync(icons).filter((f) => f.endsWith(".gif")).map((f) => f.replace(/\.gif$/, ""))
    expect([...ICON_PACKS.pokemon].sort()).toEqual(onDisk.sort())
  })

  test("jokers list matches the pngs on disk, at least 30", () => {
    const onDisk = fs.readdirSync(path.join(icons, "jokers")).map((f) => `jokers/${f.replace(/\.png$/, "")}`)
    expect([...ICON_PACKS.jokers].sort()).toEqual(onDisk.sort())
    expect(ICON_PACKS.jokers.length).toBeGreaterThanOrEqual(30)
  })

  test("includes the gen 1 to 3 starters", () => {
    ;["squirtle", "chikorita", "cyndaquil", "totodile", "treecko", "torchic"].forEach((n) => {
      expect(ICON_PACKS.pokemon).toContain(n)
    })
  })

  test("iconFile animates pokemon only", () => {
    expect(iconFile("mudkip", false)).toBe("mudkip.gif")
    expect(iconFile("mudkip", true)).toBe("mudkip.png")
    expect(iconFile("jokers/perkeo", false)).toBe("jokers/perkeo.png")
  })

  test("iconInPack maps across packs stably and keeps matching ones", () => {
    expect(iconInPack("mudkip", "pokemon")).toBe("mudkip")
    const joker = iconInPack("mudkip", "jokers")
    expect(ICON_PACKS.jokers).toContain(joker)
    expect(iconInPack("mudkip", "jokers")).toBe(joker)
    expect(ICON_PACKS.pokemon).toContain(iconInPack("jokers/perkeo", "pokemon"))
  })

  test("nextIcon picks from the chosen pack and prefers unused", () => {
    expect(ICON_PACKS.jokers).toContain(nextIcon(new Set(), "jokers"))
    const [first, ...rest] = ICON_PACKS.pokemon
    expect(nextIcon(new Set(rest), "pokemon")).toBe(first!)
  })

  test("iconPack setting defaults to pokemon and rejects unknown packs", () => {
    const defaults: Settings = { ...baseSettings, locations: [{ label: "Home", path: asDirPath("/home") }] }
    expect(defaults.iconPack).toBe("pokemon")
    expect(mergeSettings(defaults, { iconPack: "jokers" }).iconPack).toBe("jokers")
    expect(mergeSettings(defaults, { iconPack: "digimon" }).iconPack).toBe("pokemon")
  })
})
