// APNs settings from gateway.json and the .p8 key beside it.

import { createPrivateKey, type KeyObject } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"
import type { ApnsEnvironment } from "../../shared/mobile.ts"
import type { ApnsBlock } from "../gateway/config.ts"

export interface ApnsSettings {
  readonly key: KeyObject
  readonly keyId: string
  readonly teamId: string
  readonly bundleId: string
  // Default for devices that did not say
  readonly environment: ApnsEnvironment
}

const FIELDS = ["keyFile", "keyId", "teamId", "bundleId"] as const

const readKey = (dir: DirPath, file: string): KeyObject | string => {
  try {
    return createPrivateKey(readFileSync(path.resolve(dir, file), "utf8"))
  } catch {
    return `keyFile (${file} is not a readable .p8 key)`
  }
}

// Settings when complete, plus what is missing
export const apnsSettings = (dir: DirPath, block: ApnsBlock | undefined): { readonly settings: ApnsSettings | null; readonly missing: ReadonlyArray<string> } => {
  const missing = FIELDS.filter((f) => !block?.[f]?.trim())
  if (!block || missing.length) {
    return { settings: null, missing }
  }
  const key = readKey(dir, block.keyFile!)
  if (typeof key === "string") {
    return { settings: null, missing: [key] }
  }
  return {
    settings: { key, keyId: block.keyId!, teamId: block.teamId!, bundleId: block.bundleId!, environment: block.environment ?? "development" },
    missing: [],
  }
}
