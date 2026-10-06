// Where the claude binary is, and the fixed parts of every launch.

import { Context, Effect, Layer } from "effect"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

export class ClaudeBinary extends Context.Service<ClaudeBinary, { readonly path: string }>()("daycare/ClaudeBinary") {
  // A login shell so the user's PATH applies. DAYCARE_CLAUDE points every
  // session at a stand-in binary, for development.
  static readonly layer = Layer.effect(
    ClaudeBinary,
    Effect.sync(() => {
      const override = process.env["DAYCARE_CLAUDE"]
      if (override) return { path: override }
      try {
        return { path: execFileSync("/bin/zsh", ["-lc", "command -v claude"], { encoding: "utf8" }).trim() }
      } catch {
        return { path: path.join(os.homedir(), ".local", "bin", "claude") }
      }
    }),
  )
}

export const MASTER_PROMPT = [
  "You are a master session running inside Daycare.",
  "Split the work into independent units and hand each one to a worker with the",
  "mcp__daycare__spawn_subagent tool instead of doing the work yourself. Never use",
  "built-in subagents or background agents for this. Every worker",
  "is a full Claude Code session in its own terminal that the user can talk to",
  "directly, so give each one a short name and a self-contained task.",
  "Use wait_for_subagents to block until workers finish, read_subagent to read a",
  "worker's final report, and send_to_subagent to give a worker follow-up",
  "instructions. Keep your own context small: do not ask workers for full",
  "transcripts, only concise summaries.",
].join(" ")

export const WORKER_PROMPT = [
  "You are a worker session spawned by a master orchestrator in Daycare.",
  "Complete the task you were given. The user may also talk to you directly.",
  "When you finish, end with a concise summary of what you did and where any",
  "output lives; the master reads only that summary.",
].join(" ")

// Sessions must look like fresh top-level Claude Code sessions even when
// Daycare itself was launched from inside one.
export const cleanEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(env).filter(([key]) => key !== "CLAUDECODE" && !(key.startsWith("CLAUDE_CODE_") && key !== "CLAUDE_CODE_OAUTH_TOKEN")),
  )

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

// A sprite for a new master, preferring ones no master is using yet.
export const nextIcon = (used: ReadonlySet<string | null>) => {
  const free = ICONS.filter((i) => !used.has(i))
  return pick(free.length ? free : ICONS)
}

// A random agent name not already taken, or the folder's location label when
// random names are off.
export const defaultMasterName = (options: {
  readonly cwd: string
  readonly taken: ReadonlySet<string>
  readonly randomNames: boolean
  readonly locationLabel: string | undefined
}) => {
  const { taken } = options
  const unique = (base: string) => {
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
  if (options.randomNames) {
    const free = AGENT_NAMES.filter((n) => !taken.has(n))
    return free.length ? pick(free) : unique(pick(AGENT_NAMES))
  }
  return unique(options.locationLabel || path.basename(options.cwd) || "Master")
}

// Short description of a tool call for the status line.
export const describeTool = (name: string, input: unknown) => {
  const i = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>
  const short = (v: unknown) => String(v).replace(/\s+/g, " ").slice(0, 60)
  if (i["command"]) return `${name}: ${short(i["command"])}`
  if (i["file_path"]) return `${name}: ${path.basename(String(i["file_path"]))}`
  if (i["pattern"]) return `${name}: ${short(i["pattern"])}`
  if (i["url"]) return `${name}: ${short(i["url"])}`
  if (name.startsWith("mcp__daycare__")) return name.replace("mcp__daycare__", "").replace(/_/g, " ")
  return name
}
