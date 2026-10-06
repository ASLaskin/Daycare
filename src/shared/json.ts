// JSON values and typed field readers.

import { Option, Schema } from "effect"

export type Json = Schema.Json
export type JsonObject = Schema.JsonObject

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))

// Parsed JSON text, or null when invalid
export const parseJson = (text: string): Json | null => Option.getOrNull(decodeJson(text))

export const isJsonObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v)

export const obj = (v: Json | undefined): JsonObject | null => (isJsonObject(v) ? v : null)

export const str = (v: Json | undefined): string | null => (typeof v === "string" ? v : null)

export const num = (v: Json | undefined): number | null => (typeof v === "number" ? v : null)

export const arr = (v: Json | undefined): ReadonlyArray<Json> => (Array.isArray(v) ? v : [])

export const strings = (v: Json | undefined): ReadonlyArray<string> =>
  arr(v).flatMap((x) => (typeof x === "string" ? [x] : []))

// Nested field by key path, or undefined
export const at = (v: Json | undefined, ...path: ReadonlyArray<string>): Json | undefined =>
  path.reduce<Json | undefined>((cur, key) => obj(cur)?.[key], v)
