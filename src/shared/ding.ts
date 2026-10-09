// Ding variants and random picking, pure.

export type DingRole = "master" | "worker"

export interface DingVariant {
  readonly notes: ReadonlyArray<number>
  readonly gap: number
  readonly wave: "sine" | "triangle"
  readonly decay: number
}

export interface DingPick {
  readonly index: number
  readonly variant: DingVariant
  readonly detuneCents: number
  readonly gain: number
}

// Bright two note chimes
const masterVariants: ReadonlyArray<DingVariant> = [
  { notes: [880, 1318.5], gap: 0.09, wave: "sine", decay: 0.7 },
  { notes: [783.99, 1174.66], gap: 0.1, wave: "sine", decay: 0.75 },
  { notes: [987.77, 1480], gap: 0.08, wave: "sine", decay: 0.65 },
  { notes: [659.25, 987.77, 1318.5], gap: 0.075, wave: "sine", decay: 0.6 },
  { notes: [1046.5, 1568], gap: 0.11, wave: "triangle", decay: 0.6 },
]

// Low soft single notes
const workerVariants: ReadonlyArray<DingVariant> = [
  { notes: [440], gap: 0, wave: "triangle", decay: 0.35 },
  { notes: [523.25], gap: 0, wave: "triangle", decay: 0.3 },
  { notes: [392], gap: 0, wave: "sine", decay: 0.4 },
  { notes: [493.88], gap: 0, wave: "sine", decay: 0.32 },
  { notes: [349.23], gap: 0, wave: "triangle", decay: 0.38 },
]

const families: Record<DingRole, ReadonlyArray<DingVariant>> = {
  master: masterVariants,
  worker: workerVariants,
}

export const variantsFor = (role: DingRole) => families[role]

const MAX_DETUNE_CENTS = 30
const MIN_GAIN = 0.75

// Random variant that differs from previous, with pitch and volume jitter
export const pickDing = (role: DingRole, previous: number | null, rand: () => number): DingPick => {
  const variants = families[role]
  const pool = variants.map((_, i) => i).filter((i) => i !== previous)
  const index = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!
  return {
    index,
    variant: variants[index]!,
    detuneCents: (rand() * 2 - 1) * MAX_DETUNE_CENTS,
    gain: MIN_GAIN + rand() * (1 - MIN_GAIN),
  }
}

// Only a finished turn rings, not restored or idle sessions
export const shouldDing = (prev: string, next: string) =>
  next === "done" && (prev === "working" || prev === "needs_you")
