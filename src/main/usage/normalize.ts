import type { UsageLimit } from "../../shared/usage.ts"

const LIMIT_LABEL: Record<string, string> = {
  session: "Session",
  weekly_all: "Week",
  weekly_opus: "Week, Opus",
  weekly_sonnet: "Week, Sonnet",
}

// Newer limits array or older keys.
export const normalizeUsage = (body: any): ReadonlyArray<UsageLimit> => {
  if (Array.isArray(body?.limits) && body.limits.length) {
    return body.limits.map((l: any) => ({
      kind: String(l.kind),
      label: LIMIT_LABEL[l.kind] ?? String(l.kind).replace(/_/g, " "),
      percent: Number(l.percent) || 0,
      resetsAt: l.resets_at || null,
    }))
  }
  const pick = (key: string, kind: string): UsageLimit | null =>
    body?.[key]
      ? { kind, label: LIMIT_LABEL[kind]!, percent: Number(body[key].utilization) || 0, resetsAt: body[key].resets_at || null }
      : null
  return [
    pick("five_hour", "session"),
    pick("seven_day", "weekly_all"),
    pick("seven_day_opus", "weekly_opus"),
    pick("seven_day_sonnet", "weekly_sonnet"),
  ].filter((l): l is UsageLimit => l !== null)
}

// Retry-After is seconds or a date.
export const retryAfterMs = (value: string | null, now: number): number => {
  if (!value) return 0
  const secs = Number(value)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : 0
}
