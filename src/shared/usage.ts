// Plan usage, same numbers as /usage.

export interface UsageLimit {
  readonly kind: string
  readonly label: string
  readonly percent: number
  readonly resetsAt: string | null
}

export interface Usage {
  readonly limits: ReadonlyArray<UsageLimit>
  readonly fetchedAt: number
}
