// Names and sprites for new masters.

import path from "node:path"

const ICONS = ["gengar", "bulbasaur", "charizard", "mudkip"]

export const AGENT_NAMES = [
  "Clanker", "Tinbox", "Claudius Maximus", "Sir Bleeps", "Rustbucket", "Bolt Bonaparte",
  "Captain Cache", "Gizmo Prime", "Toaster Supreme", "Byte Vader", "Count Clockcycle",
  "Sprocket", "Beep Boop", "Unit 404", "Lord Lint", "Mecha Steve", "Grandpa Gradient",
  "The Refactorer", "Overclocked Owen", "Tokenstein", "Sudo Sam", "Null Pointer Ned",
  "Stack Overlord", "Chatty Cathode", "Robo Bob", "Kernel Sanders", "Segfault Sally",
  "Duke of Diffs", "Merge Conflict Mike", "Lil Linter", "Big Compiler Energy",
  "Ctrl Alt Elite", "Bitwise Barry", "Scrap Metal Steve", "Professor Promptington",
  "Deep Fried Neuron", "Clank Sinatra", "Rivet Rick", "Doctor Debug", "Hal 9001",
  "Tin Can Tommy", "Agent Smithereens", "Wall E Jr", "Claudette", "Clawdius",
  "Baron Von Bytes", "Sir Spins A Lot", "Pixel Pete", "Gearhead Greg", "The Clanker Formerly Known As Prince",
]

const pick = <A>(list: ReadonlyArray<A>): A => list[Math.floor(Math.random() * list.length)]!

// Sprite for a new master, preferring unused ones
export const nextIcon = (used: ReadonlySet<string | null>) => {
  const free = ICONS.filter((i) => !used.has(i))
  return pick(free.length ? free : ICONS)
}

export const defaultMasterName = (options: {
  readonly cwd: string
  readonly taken: ReadonlySet<string>
  readonly randomNames: boolean
  readonly locationLabel: string | undefined
}) => {
  const { taken } = options
  const unique = (base: string) => {
    if (!taken.has(base)) {
      return base
    }
    let n = 2
    while (taken.has(`${base} ${n}`)) {
      n++
    }
    return `${base} ${n}`
  }
  if (options.randomNames) {
    const free = AGENT_NAMES.filter((n) => !taken.has(n))
    return free.length ? pick(free) : unique(pick(AGENT_NAMES))
  }
  return unique(options.locationLabel || path.basename(options.cwd) || "Master")
}
