// Icon packs for session avatars.

import { Schema } from "effect"
import { JOKER_ICONS } from "./joker-icons.ts"
import { POKEMON_ICONS } from "./pokemon-icons.ts"

export const IconPack = Schema.Literals(["pokemon", "jokers"])
export type IconPack = typeof IconPack.Type

export const ICON_PACKS: Record<IconPack, ReadonlyArray<string>> = {
  pokemon: POKEMON_ICONS,
  jokers: JOKER_ICONS,
}

// Icon from the pack, mapped stably when the stored one belongs elsewhere
export const iconInPack = (icon: string, pack: IconPack) => {
  const icons = ICON_PACKS[pack]
  if (icons.includes(icon)) {
    return icon
  }
  const home = Object.values(ICON_PACKS).find((list) => list.includes(icon))
  return icons[Math.max(0, home?.indexOf(icon) ?? 0) % icons.length]!
}

// Avatar file for an icon id, animated only for Pokemon
export const iconFile = (icon: string, still: boolean) =>
  icon.startsWith("jokers/") || still ? `${icon}.png` : `${icon}.gif`
