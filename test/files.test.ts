// Non-image attachments: path refs, content blocks, checks and saving.

import { describe, expect, test } from "bun:test"
import { Effect, Exit, Schema } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { safeFileName, saveAttachment } from "../src/main/attachments/saved.ts"
import { prepareFiles } from "../src/main/chat/files.ts"
import { attachRoute } from "../src/renderer/chat/attach-rules.ts"
import { mentionsOf } from "../src/shared/attachments.ts"
import { ChatEvent } from "../src/shared/chat.ts"
import {
  fileName,
  fileRefText,
  MAX_FILES,
  MAX_SAVED_BYTES,
  pathOfFileRef,
  TOO_LARGE_FILE_MESSAGE,
  TOO_MANY_FILES_MESSAGE,
} from "../src/shared/files.ts"
import { asDirPath, asFilePath } from "../src/shared/ids.ts"
import { asBase64, type ChatImage } from "../src/shared/images.ts"

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"))
const csv = path.join(dir, "data.csv")
fs.writeFileSync(csv, "a,b\n1,2\n")
const CSV = asFilePath(csv)
const png: ChatImage = { mediaType: "image/png", data: asBase64("iVBORw0KGgo=") }

const failure = <A, E extends { readonly message: string }>(eff: Effect.Effect<A, E>) => {
  const exit = Effect.runSyncExit(eff)
  return Exit.isFailure(exit) ? exit.cause.toString() : null
}

describe("file refs", () => {
  test("round trip an absolute path", () => {
    expect(pathOfFileRef(fileRefText(CSV))).toBe(CSV)
  })

  test("ignore other text", () => {
    expect(pathOfFileRef("hello")).toBeNull()
    expect(pathOfFileRef("Attached file: relative.csv")).toBeNull()
    expect(pathOfFileRef(`${fileRefText(CSV)}\nmore`)).toBeNull()
  })

  test("name is the last path segment", () => {
    expect(fileName(CSV)).toBe("data.csv")
    expect(fileName(asFilePath("/tmp/folder/"))).toBe("folder")
  })
})

describe("user events", () => {
  test("stored events without files decode with none", () => {
    const decode = Schema.decodeUnknownSync(ChatEvent)
    expect(decode({ kind: "user", text: "hi", images: [], omittedImages: 0 })).toEqual({ kind: "user", text: "hi", images: [], omittedImages: 0, files: [] })
  })

  test("attached files count as mentions", () => {
    expect(mentionsOf({ kind: "user", text: "see /tmp/a.txt", images: [], omittedImages: 0, files: [CSV] }).paths).toEqual(["/tmp/a.txt", CSV])
  })
})

describe("attach rules for files", () => {
  const candidate = { images: 0, files: 0, bytes: 1, mediaType: null, hasPath: true }

  test("rejects past the file count", () => {
    expect(attachRoute({ ...candidate, files: MAX_FILES })).toEqual({ kind: "reject", message: TOO_MANY_FILES_MESSAGE })
  })

  test("path-less files must fit the save limit", () => {
    expect(attachRoute({ ...candidate, hasPath: false, bytes: MAX_SAVED_BYTES })).toEqual({ kind: "file" })
    expect(attachRoute({ ...candidate, hasPath: false, bytes: MAX_SAVED_BYTES + 1 })).toEqual({ kind: "reject", message: TOO_LARGE_FILE_MESSAGE })
    expect(attachRoute({ ...candidate, bytes: MAX_SAVED_BYTES + 1 })).toEqual({ kind: "file" })
  })
})

describe("prepareFiles", () => {
  test("keeps existing files and folders, normalized", async () => {
    expect(await Effect.runPromise(prepareFiles([csv, `${dir}/./`], os.homedir()))).toEqual([CSV, asFilePath(dir)])
  })

  test("rejects missing files and too many", async () => {
    const missing = await Effect.runPromiseExit(prepareFiles([path.join(dir, "gone.csv")], os.homedir()))
    expect(Exit.isFailure(missing) ? missing.cause.toString() : "").toContain("gone.csv is no longer available.")
    expect(failure(prepareFiles(Array<string>(MAX_FILES + 1).fill(csv), os.homedir()))).toContain(TOO_MANY_FILES_MESSAGE)
  })
})

describe("saved attachments", () => {
  test("names cannot escape the folder", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd")
    expect(safeFileName("..")).toBe("attachment")
    expect(safeFileName("a\\b.txt")).toBe("b.txt")
    expect(safeFileName(`${"x".repeat(300)}.csv`)).toHaveLength(120)
    expect(safeFileName(`${"x".repeat(300)}.csv`).endsWith(".csv")).toBe(true)
  })

  test("writes the bytes under its own folder", async () => {
    const root = asDirPath(path.join(dir, "attachments"))
    const data = asBase64(Buffer.from("hello").toString("base64"))
    const first = await Effect.runPromise(saveAttachment(root, { name: "note.txt", data }))
    const second = await Effect.runPromise(saveAttachment(root, { name: "note.txt", data }))
    expect(first).not.toBe(second)
    expect(path.basename(first)).toBe("note.txt")
    expect(first.startsWith(root)).toBe(true)
    expect(fs.readFileSync(first, "utf8")).toBe("hello")
  })
})
