// gateway.json: port, pairing token and the hand edited apns block.

import { Exit, Schema } from "effect"
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { asDirPath, type DirPath, type FilePath } from "../../shared/ids.ts"
import { ApnsEnvironment, asPairingToken, PairingToken } from "../../shared/mobile.ts"

export const DEFAULT_PORT = 7443

const ApnsBlock = Schema.Struct({
  keyFile: Schema.optionalKey(Schema.String),
  keyId: Schema.optionalKey(Schema.String),
  teamId: Schema.optionalKey(Schema.String),
  bundleId: Schema.optionalKey(Schema.String),
  environment: Schema.optionalKey(ApnsEnvironment),
})
export type ApnsBlock = typeof ApnsBlock.Type

export const GatewayConfig = Schema.Struct({
  port: Schema.Int,
  token: PairingToken,
  apns: Schema.optionalKey(ApnsBlock),
})
export type GatewayConfig = typeof GatewayConfig.Type

const decodeConfig = Schema.decodeUnknownExit(Schema.fromJsonString(GatewayConfig))

// DAYCARE_MOBILE_DIR, else mobile/ next to the database
export const mobileDir = (env: NodeJS.ProcessEnv, db: FilePath): DirPath =>
  asDirPath(env["DAYCARE_MOBILE_DIR"] || path.join(path.dirname(db), "mobile"))

export const configFile = (dir: DirPath) => path.join(dir, "gateway.json")

export const newToken = (): PairingToken => asPairingToken(randomBytes(32).toString("base64url"))

// Null when the phone was never set up
export const loadConfig = (dir: DirPath): GatewayConfig | null => {
  const file = configFile(dir)
  if (!existsSync(file)) {
    return null
  }
  chmodSync(dir, 0o700)
  chmodSync(file, 0o600)
  const decoded = decodeConfig(readFileSync(file, "utf8"))
  if (Exit.isFailure(decoded)) {
    throw new Error(`${file} is not a valid gateway config`)
  }
  return decoded.value
}

// Atomic write, directory 0700 and file 0600
const save = (dir: DirPath, config: GatewayConfig) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const file = configFile(dir)
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  renameSync(temp, file)
}

// Existing config, or a fresh one with a new token
export const ensureConfig = (dir: DirPath): GatewayConfig => {
  const existing = loadConfig(dir)
  if (existing) {
    return existing
  }
  const config: GatewayConfig = { port: DEFAULT_PORT, token: newToken() }
  save(dir, config)
  return config
}

// Keeps port and apns as they are
export const rotateToken = (dir: DirPath): GatewayConfig => {
  const config = { ...ensureConfig(dir), token: newToken() }
  save(dir, config)
  return config
}
