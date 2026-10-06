// Electron facing layers against a fake electron module.

import { describe, expect, mock, test } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { asDirPath, asFilePath, type DirPath } from "../src/shared/ids.ts"
import type { EventChannel, Events } from "../src/shared/ipc.ts"
import { Invoke, Send } from "../src/shared/ipc.ts"
import type { Json } from "../src/shared/json.ts"

type Handler = (event: object, payload?: Json) => Promise<Json> | undefined
const handlers = new Map<string, Handler>()
const listeners = new Map<string, Handler>()
const icons: Array<string> = []
const fakeApp = { isPackaged: false, quit: () => {}, dock: { setIcon: (file: string) => void icons.push(file) } }

mock.module("electron", () => ({
  app: fakeApp,
  ipcMain: {
    handle: (channel: string, fn: Handler) => void handlers.set(channel, fn),
    removeHandler: (channel: string) => void handlers.delete(channel),
    on: (channel: string, fn: Handler) => void listeners.set(channel, fn),
    removeListener: (channel: string) => void listeners.delete(channel),
  },
  dialog: {},
  shell: {},
  Menu: {},
  BrowserWindow: class {},
}))

// Modules under test, loaded after the electron mock
const { AppPaths } = await import("../src/main/AppPaths.ts")
const { Ui } = await import("../src/main/Ui.ts")
const { Updater } = await import("../src/main/updater/Updater.ts")
const { AppIcon } = await import("../src/main/electron/AppIcon.ts")
const { Ipc } = await import("../src/main/electron/Ipc.ts")
const { MainWindow } = await import("../src/main/electron/Window.ts")
const { SettingsStore } = await import("../src/main/settings/SettingsStore.ts")
const { Sessions } = await import("../src/main/sessions/Sessions.ts")
const { Power } = await import("../src/main/power/Power.ts")
const { Skills } = await import("../src/main/skills/Skills.ts")
const { Usage } = await import("../src/main/usage/Usage.ts")
const { ClaudeBinary } = await import("../src/main/sessions/Claude.ts")

const tmp = () => asDirPath(fs.mkdtempSync(path.join(os.tmpdir(), "daycare-electron-")))

const sent: Array<{ channel: EventChannel; payload: Events[EventChannel] }> = []
const FakeUi = Layer.succeed(
  Ui,
  Ui.of({
    send: <C extends EventChannel>(channel: C, payload: Events[C]) => void sent.push({ channel, payload }),
    notify: () => {},
    confirm: () => Effect.succeed(true),
  }),
)
const paths = (appRoot: DirPath, userData = tmp()) => Layer.succeed(AppPaths, AppPaths.of({ appRoot, userData, home: userData }))
const fakeWin = Layer.succeed(MainWindow, MainWindow.of({ win: { isDestroyed: () => false } as never }))

describe("Ipc", () => {
  const calls: Array<[string, ReadonlyArray<Json>]> = []
  const record =
    (name: string) =>
    (...args: Array<Json>) =>
      Effect.sync(() => void calls.push([name, args]))
  const FakeSessions = Layer.succeed(Sessions, {
    rename: record("rename"),
    close: record("close"),
    write: record("write"),
    resize: record("resize"),
    list: Effect.succeed([]),
  } as never)
  const none = <S>(tag: S) => Layer.succeed(tag as never, {} as never)
  const deps = Layer.mergeAll(
    FakeSessions,
    FakeUi,
    fakeWin,
    paths(asDirPath("/app")),
    none(SettingsStore),
    none(Usage),
    none(Power),
    none(Skills),
    none(Updater),
    Layer.succeed(ClaudeBinary, { path: asFilePath("/bin/claude") }),
  )

  const withIpc = (body: () => Promise<void>) =>
    Effect.runPromise(Effect.scoped(Effect.flatMap(Layer.build(Layer.provide(Ipc, deps)), () => Effect.promise(body))))

  test("registers every channel and removes them on close", async () => {
    await withIpc(async () => {
      expect([...handlers.keys()].sort()).toEqual(Object.keys(Invoke).sort())
      expect([...listeners.keys()].sort()).toEqual(Object.keys(Send).sort())
    })
    expect(handlers.size).toBe(0)
    expect(listeners.size).toBe(0)
  })

  test("decodes payloads before the handler runs", async () => {
    calls.length = 0
    await withIpc(async () => {
      expect(await handlers.get("app:defaults")!({}, undefined)).toEqual({ cwd: expect.any(String), claude: "/bin/claude" })
      await handlers.get("session:rename")!({}, { id: "a", name: "New" })
      await expect(Promise.resolve(handlers.get("session:rename")!({}, { id: 1 }))).rejects.toThrow()
      await expect(Promise.resolve(handlers.get("session:close")!({}, 7))).rejects.toThrow()
      listeners.get("pty:resize")!({}, { id: "a", cols: 80, rows: 24 })
      listeners.get("pty:resize")!({}, { id: "a", cols: "wide" })
      listeners.get("pty:write")!({}, { id: "a", data: "x" })
    })
    expect(calls).toEqual([
      ["rename", ["a", "New"]],
      ["resize", ["a", 80, 24]],
      ["write", ["a", "x"]],
    ])
  })
})

describe("Updater", () => {
  const withUpdater = <A>(appRoot: DirPath, f: (u: (typeof Updater)["Service"]) => Effect.Effect<A>) =>
    Effect.runPromise(Effect.flatMap(Updater, f).pipe(Effect.provide(Layer.provide(Updater.layer, Layer.merge(FakeUi, paths(appRoot))))))

  test("info falls back to the checkout in dev", async () => {
    const root = tmp()
    expect(await withUpdater(root, (u) => u.info)).toEqual({ sourceDir: root, commit: null, builtAt: null })
  })

  test("info reads build-info.json", async () => {
    const root = tmp()
    const info = { sourceDir: asDirPath("/src"), commit: "abc1234", builtAt: "2026-10-06T00:00:00.000Z" }
    fs.mkdirSync(path.join(root, "dist"))
    fs.writeFileSync(path.join(root, "dist", "build-info.json"), JSON.stringify(info))
    expect(await withUpdater(root, (u) => u.info)).toEqual(info)
  })

  test("run fails without an update script", async () => {
    const res = await withUpdater(tmp(), (u) => u.run)
    expect(res.ok).toBe(false)
    expect(res.log).toContain("Cannot find")
  })

  const withScript = (body: string) => {
    const root = tmp()
    fs.mkdirSync(path.join(root, "scripts"))
    fs.writeFileSync(path.join(root, "scripts", "update.sh"), `#!/bin/zsh\n${body}\n`, { mode: 0o755 })
    return root
  }

  test("run streams the script's output", async () => {
    sent.length = 0
    const res = await withUpdater(withScript("echo pulled; echo built >&2"), (u) => u.run)
    expect(res.ok).toBe(true)
    expect(res.log).toContain("pulled")
    expect(res.log).toContain("built")
    expect(sent.filter((s) => s.channel === "update:log").length).toBeGreaterThan(0)
  })

  test("run reports a failing script", async () => {
    const res = await withUpdater(withScript("echo broke; exit 3"), (u) => u.run)
    expect(res).toEqual({ ok: false, log: expect.stringContaining("broke") })
  })
})

describe("AppIcon", () => {
  test("shows the chosen logo and follows settings", async () => {
    icons.length = 0
    const deps = Layer.provideMerge(SettingsStore.layer, Layer.mergeAll(paths(asDirPath("/app")), fakeWin))
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ctx = yield* Layer.build(Layer.provideMerge(AppIcon, deps))
          const store = yield* Effect.provide(SettingsStore, ctx)
          yield* store.update({ appIcon: "house" })
          yield* Effect.sleep("20 millis")
          yield* store.update({ appIcon: "house" })
          yield* store.update({ appIcon: "block" })
          yield* Effect.sleep("20 millis")
        }),
      ),
    )
    // Random icon first, then each change once
    expect(icons.length).toBeGreaterThanOrEqual(2)
    expect(icons.slice(-2).map((f) => path.basename(f))).toEqual(["house.png", "block.png"])
    expect(icons.every((f) => f.startsWith("/app/assets/brand/logos/"))).toBe(true)
  })
})
