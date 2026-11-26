// Result of one phone command.

import { Schema } from "effect"
import type { Json } from "../../shared/json.ts"
import { type ErrorCode, GatewayError } from "../../shared/mobile.ts"

export type Outcome = { readonly result: Json } | { readonly error: GatewayError }

export const Outcome = Schema.Union([Schema.Struct({ result: Schema.Json }), Schema.Struct({ error: GatewayError })])

export const ok = (result: Json): Outcome => ({ result })

export const fail = (code: ErrorCode, message: string): Outcome => ({ error: { code, message } })

const RETRYABLE = [/coordinator is stopping/, /has not stopped yet/]

// Hub refusals, or retryable when the coordinator is busy stopping
export const refused = (message: string): Outcome => fail(RETRYABLE.some((r) => r.test(message)) ? "unavailable" : "rejected", message)

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
