// Tailscale CLI: this node's MagicDNS name, addresses and HTTPS certs.

import { Exit, Schema } from "effect"
import { existsSync } from "node:fs"

const APP_CLI = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
const TIMEOUT_MS = 60_000

export interface TailnetSelf {
  // MagicDNS name without the trailing dot
  readonly host: string
  readonly addresses: ReadonlyArray<string>
}

export interface Tailscale {
  readonly self: () => Promise<TailnetSelf>
  readonly cert: (host: string, certFile: string, keyFile: string) => Promise<void>
}

const Status = Schema.Struct({
  BackendState: Schema.String,
  Self: Schema.optionalKey(
    Schema.Struct({
      DNSName: Schema.optionalKey(Schema.String),
      TailscaleIPs: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
    }),
  ),
})

const decodeStatus = Schema.decodeUnknownExit(Schema.fromJsonString(Status))

// DAYCARE_TAILSCALE, then PATH, then the standalone app
export const findCli = (env: NodeJS.ProcessEnv): string | null =>
  env["DAYCARE_TAILSCALE"] || Bun.which("tailscale", { PATH: env["PATH"] ?? "" }) || (existsSync(APP_CLI) ? APP_CLI : null)

const run = async (cli: string, args: ReadonlyArray<string>) => {
  const proc = Bun.spawn([cli, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: TIMEOUT_MS })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { out, err: err.trim(), code }
}

// Parsed `tailscale status --json`, or why it is unusable
export const parseStatus = (text: string): TailnetSelf => {
  const decoded = decodeStatus(text)
  if (Exit.isFailure(decoded)) {
    throw new Error("Tailscale status could not be read")
  }
  const status = decoded.value
  if (status.BackendState !== "Running") {
    throw new Error(`Tailscale is not running (${status.BackendState})`)
  }
  const host = (status.Self?.DNSName ?? "").replace(/\.$/, "")
  if (!host) {
    throw new Error("MagicDNS is off for this tailnet")
  }
  const addresses = status.Self?.TailscaleIPs ?? []
  if (addresses.length === 0) {
    throw new Error("Tailscale has no addresses for this Mac")
  }
  return { host, addresses }
}

// Readable reason for a failed `tailscale cert`
export const certError = (stderr: string) =>
  /https|not enabled|disabled/i.test(stderr) && !/permission|denied|sandbox/i.test(stderr)
    ? "HTTPS certificates are off for this tailnet; enable them in the Tailscale admin console"
    : `tailscale cert failed: ${stderr || "no output"}`

export const makeTailscale = (env: NodeJS.ProcessEnv): Tailscale => {
  const cli = () => {
    const found = findCli(env)
    if (!found) {
      throw new Error("Tailscale is not installed")
    }
    return found
  }
  return {
    self: async () => {
      const { out, err, code } = await run(cli(), ["status", "--json"])
      if (!out.trim()) {
        throw new Error(code === 0 ? "Tailscale status was empty" : `Tailscale is not running: ${err}`)
      }
      return parseStatus(out)
    },
    cert: async (host, certFile, keyFile) => {
      const { err, code } = await run(cli(), ["cert", "--cert-file", certFile, "--key-file", keyFile, host])
      if (code !== 0) {
        throw new Error(certError(err))
      }
    },
  }
}
