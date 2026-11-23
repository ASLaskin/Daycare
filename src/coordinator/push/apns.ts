// APNs provider: ES256 JWT and HTTP/2 requests.

import { sign } from "node:crypto"
import http2 from "node:http2"
import { at, type Json, parseJson, str } from "../../shared/json.ts"
import type { ApnsEnvironment, ApnsToken } from "../../shared/mobile.ts"
import type { ApnsSettings } from "./apnsConfig.ts"

// Apple allows 20 to 60 minutes
export const JWT_REFRESH_MS = 50 * 60_000
const REQUEST_MS = 15_000

export const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  development: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
}

export type PushType = "alert" | "liveactivity"

export interface ApnsRequest {
  readonly token: ApnsToken
  readonly environment: ApnsEnvironment
  readonly type: PushType
  readonly payload: Json
  readonly priority: 5 | 10
  readonly collapseId?: string
}

export interface ApnsResponse {
  readonly status: number
  readonly reason: string | null
}

// One HTTP/2 POST; swapped out in tests
export type Transport = (origin: string, path: string, headers: Record<string, string>, body: string) => Promise<ApnsResponse>

const base64url = (s: string | Buffer) => Buffer.from(s).toString("base64url")

// Provider token signed with the team's .p8 key
export const makeJwt = (settings: Pick<ApnsSettings, "key" | "keyId" | "teamId">, nowMs: number) => {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: settings.keyId }))
  const claims = base64url(JSON.stringify({ iss: settings.teamId, iat: Math.floor(nowMs / 1000) }))
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: settings.key, dsaEncoding: "ieee-p1363" })
  return `${header}.${claims}.${base64url(signature)}`
}

export const topicOf = (bundleId: string, type: PushType) => (type === "liveactivity" ? `${bundleId}.push-type.liveactivity` : bundleId)

// Headers for one push
export const apnsHeaders = (settings: ApnsSettings, jwt: string, req: ApnsRequest): Record<string, string> => ({
  authorization: `bearer ${jwt}`,
  "apns-topic": topicOf(settings.bundleId, req.type),
  "apns-push-type": req.type,
  "apns-priority": String(req.priority),
  "content-type": "application/json",
  ...(req.collapseId ? { "apns-collapse-id": req.collapseId.slice(0, 64) } : {}),
})

// The token will never work again
export const deadToken = (r: ApnsResponse) => r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered" || r.reason === "DeviceTokenNotForTopic"

// One reused session per origin, reconnected after errors
export const http2Transport = (): Transport & { readonly close: () => void } => {
  const sessions = new Map<string, http2.ClientHttp2Session>()

  const sessionFor = (origin: string) => {
    const existing = sessions.get(origin)
    if (existing && !existing.closed && !existing.destroyed) {
      return existing
    }
    const session = http2.connect(origin)
    const forget = () => {
      if (sessions.get(origin) === session) {
        sessions.delete(origin)
      }
    }
    session.on("error", forget)
    session.on("close", forget)
    session.on("goaway", forget)
    sessions.set(origin, session)
    return session
  }

  const transport: Transport = (origin, path, headers, body) =>
    new Promise((resolve, reject) => {
      const req = sessionFor(origin).request({ ":method": "POST", ":path": path, ...headers })
      let status = 0
      let text = ""
      req.setEncoding("utf8")
      req.setTimeout(REQUEST_MS, () => req.close(http2.constants.NGHTTP2_CANCEL))
      req.on("response", (h) => {
        status = Number(h[":status"] ?? 0)
      })
      req.on("data", (chunk: string) => {
        text += chunk
      })
      req.on("end", () => {
        resolve({ status, reason: str(at(parseJson(text) ?? undefined, "reason")) })
      })
      req.on("error", reject)
      req.end(body)
    })

  return Object.assign(transport, { close: () => sessions.forEach((s) => s.close()) })
}

export const makeApns = (settings: ApnsSettings, transport: Transport, now = Date.now) => {
  let jwt: { readonly token: string; readonly at: number } | null = null

  const token = (fresh: boolean) => {
    if (fresh || !jwt || now() - jwt.at >= JWT_REFRESH_MS) {
      jwt = { token: makeJwt(settings, now()), at: now() }
    }
    return jwt.token
  }

  const post = (req: ApnsRequest, fresh: boolean) =>
    transport(APNS_HOSTS[req.environment], `/3/device/${req.token}`, apnsHeaders(settings, token(fresh), req), JSON.stringify(req.payload))

  return {
    // Retries once with a new JWT when Apple says it expired
    send: async (req: ApnsRequest): Promise<ApnsResponse> => {
      const first = await post(req, false)
      return first.status === 403 && first.reason === "ExpiredProviderToken" ? post(req, true) : first
    },
  }
}

export type Apns = ReturnType<typeof makeApns>
