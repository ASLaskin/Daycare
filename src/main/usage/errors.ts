// Ways a usage fetch can fail.

import { Schema } from "effect"

export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", { retryAfterMs: Schema.Number }) {}
export class UsageUnavailable extends Schema.TaggedError<UsageUnavailable>()("UsageUnavailable", { reason: Schema.String }) {}
