// HTTPS cert and key for the MagicDNS name, kept under mobile/tls.

import { X509Certificate } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"
import type { Tailscale } from "./tailscale.ts"

export interface TlsFiles {
  readonly cert: string
  readonly key: string
  // Epoch ms
  readonly expiresAt: number
}

export const tlsPaths = (dir: DirPath, host: string) => {
  const tls = path.join(dir, "tls")
  return { dir: tls, cert: path.join(tls, `${host}.crt`), key: path.join(tls, `${host}.key`) }
}

const read = (cert: string, key: string): TlsFiles => {
  const pem = readFileSync(cert, "utf8")
  return { cert: pem, key: readFileSync(key, "utf8"), expiresAt: Date.parse(new X509Certificate(pem).validTo) }
}

// Runs tailscale cert, which only renews near expiry; falls back to files on disk
export const refreshTls = async (tailscale: Tailscale, dir: DirPath, host: string): Promise<TlsFiles> => {
  const files = tlsPaths(dir, host)
  mkdirSync(files.dir, { recursive: true, mode: 0o700 })
  const failure = await tailscale.cert(host, files.cert, files.key).then(
    () => null,
    (e: Error) => e,
  )
  if (failure && (!existsSync(files.cert) || !existsSync(files.key))) {
    throw failure
  }
  chmodSync(files.key, 0o600)
  const found = read(files.cert, files.key)
  if (failure && found.expiresAt <= Date.now()) {
    throw failure
  }
  if (failure) {
    console.error(`gateway: ${failure.message}; using the existing certificate`)
  }
  return found
}
