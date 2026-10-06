import { arr, at, type Json, obj, str } from "../../shared/json.ts";
import type { UsageLimit } from "../../shared/usage.ts";

const LIMIT_LABEL: Record<string, string> = {
  session: "Session",
  weekly_all: "Week",
  weekly_opus: "Week, Opus",
  weekly_sonnet: "Week, Sonnet",
};

// Reads the limits array, or the older per window keys.
export const normalizeUsage = (body: Json): ReadonlyArray<UsageLimit> => {
  const limits = arr(at(body, "limits"));
  if (limits.length) {
    return limits.map((l) => {
      const kind = String(at(l, "kind"));
      return {
        kind,
        label: LIMIT_LABEL[kind] ?? kind.replace(/_/g, " "),
        percent: Number(at(l, "percent")) || 0,
        resetsAt: str(at(l, "resets_at")) || null,
      };
    });
  }
  const pick = (key: string, kind: string): UsageLimit | null => {
    const window = obj(at(body, key));
    return window
      ? {
          kind,
          label: LIMIT_LABEL[kind]!,
          percent: Number(window["utilization"]) || 0,
          resetsAt: str(window["resets_at"]) || null,
        }
      : null;
  };
  return [
    pick("five_hour", "session"),
    pick("seven_day", "weekly_all"),
    pick("seven_day_opus", "weekly_opus"),
    pick("seven_day_sonnet", "weekly_sonnet"),
  ].filter((l): l is UsageLimit => l !== null);
};

// Retry-After header, in seconds or as a date, to milliseconds.
export const retryAfterMs = (value: string | null, now: number): number => {
  if (!value) {
    return 0;
  }
  const secs = Number(value);
  if (Number.isFinite(secs)) {
    return Math.max(0, secs * 1000);
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
};
