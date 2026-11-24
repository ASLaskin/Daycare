// FeedAccounts backed by the feed partition's cookies.

import { app, type BrowserWindow, type Cookie, session } from "electron"
import { Effect, Layer } from "effect"
import { FEED_PAGES, FEED_PARTITION, feedAccounts, feedPage, pageCookies, pageOrigins } from "../../shared/feed.ts"
import type { FeedTab } from "../../shared/settings.ts"
import { MainWindow } from "../electron/Window.ts"
import { Ui } from "../Ui.ts"
import { FeedAccounts } from "./FeedAccounts.ts"
import { openSignInWindow } from "./signInWindow.ts"
import { guardFeedWebviews } from "./webviews.ts"

const cookieUrl = (c: Cookie) => `${c.secure ? "https" : "http"}://${(c.domain ?? "").replace(/^\./, "")}${c.path ?? "/"}`

export const ElectronFeedAccounts = Layer.effect(
  FeedAccounts,
  Effect.gen(function* () {
    const ui = yield* Ui
    const { win: main } = yield* MainWindow
    yield* Effect.promise(() => app.whenReady())
    const ses = session.fromPartition(FEED_PARTITION)
    const windows = new Map<FeedTab, BrowserWindow>()

    const list = Effect.promise(() => ses.cookies.get({})).pipe(Effect.map(feedAccounts))

    const publish = () =>
      void Effect.runFork(list.pipe(Effect.tap((accounts) => Effect.sync(() => ui.send("feed:accounts", accounts)))))

    // Signing in closes that site's window
    const onCookie = (_event: Electron.Event, cookie: Cookie, _cause: string, removed: boolean) => {
      const page = FEED_PAGES.find((p) => p.sessionCookie.name === cookie.name)
      if (!page) {
        return
      }
      publish()
      if (!removed) {
        windows.get(page.id)?.close()
      }
    }
    yield* Effect.acquireRelease(
      Effect.sync(() => ses.cookies.on("changed", onCookie)),
      () => Effect.sync(() => ses.cookies.off("changed", onCookie)),
    )

    const signIn = (id: FeedTab) =>
      Effect.sync(() => {
        const open = windows.get(id)
        if (open && !open.isDestroyed()) {
          open.focus()
          return
        }
        const page = feedPage(id)
        if (!page) {
          return
        }
        const win = openSignInWindow(page, main)
        windows.set(id, win)
        win.on("closed", () => windows.delete(id))
      })

    const disconnect = (id: FeedTab) =>
      Effect.gen(function* () {
        const page = feedPage(id)
        if (!page) {
          return yield* list
        }
        const cookies = pageCookies(page, yield* Effect.promise(() => ses.cookies.get({})))
        yield* Effect.promise(() => Promise.all(cookies.map((c) => ses.cookies.remove(cookieUrl(c), c.name))))
        yield* Effect.promise(() => Promise.all(pageOrigins(page).map((origin) => ses.clearStorageData({ origin }))))
        return yield* list
      })

    guardFeedWebviews(main, () => Effect.runSync(signIn("shorts")))

    return FeedAccounts.of({ list, signIn, disconnect })
  }),
)
