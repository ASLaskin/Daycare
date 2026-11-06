// Phone pairing through the coordinator's gateway.

import { Context, Effect, Schema } from "effect"
import type { Command } from "../../shared/coordinator.ts"
import type { Json } from "../../shared/json.ts"
import { PairingInfo, PairingStatus } from "../../shared/mobile.ts"

export interface PhoneShape {
  readonly pairing: Effect.Effect<PairingStatus, { readonly message: string }>
  readonly rotate: Effect.Effect<PairingInfo, { readonly message: string }>
  readonly setup: Effect.Effect<PairingInfo, { readonly message: string }>
}

export class Phone extends Context.Service<Phone, PhoneShape>()("daycare/Phone") {}

const failure = (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) })

export const makePhone = (request: (command: Command) => Promise<Json>): PhoneShape => {
  const ask = (command: Command) => Effect.tryPromise({ try: () => request(command), catch: failure })
  const decodeStatus = Schema.decodeUnknownEffect(PairingStatus)
  const decodeInfo = Schema.decodeUnknownEffect(PairingInfo)
  return {
    pairing: ask({ method: "pairing" }).pipe(Effect.flatMap((r) => decodeStatus(r).pipe(Effect.mapError(failure)))),
    rotate: ask({ method: "pairing-rotate" }).pipe(Effect.flatMap((r) => decodeInfo(r).pipe(Effect.mapError(failure)))),
    setup: ask({ method: "pairing-setup" }).pipe(Effect.flatMap((r) => decodeInfo(r).pipe(Effect.mapError(failure)))),
  }
}
