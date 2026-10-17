// Deterministic random numbers in 0..1 (mulberry32).

export const seeded = (seed: number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    const a = Math.imul(state ^ (state >>> 15), 1 | state)
    const b = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296
  }
}
