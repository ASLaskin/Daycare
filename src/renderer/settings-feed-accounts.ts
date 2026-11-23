// Settings card connecting Instagram and YouTube for the Reels page.

import { FEED_PAGES, type FeedAccount, type FeedPage } from "../shared/feed.ts"
import type { FeedTab } from "../shared/settings.ts"
import { api } from "./api.ts"
import { $, el } from "./dom.ts"
import { messageOf } from "./errors.ts"
import { toast } from "./toast.ts"

let accounts = new Map<FeedTab, boolean>()

const setAccounts = (list: ReadonlyArray<FeedAccount>) => {
  accounts = new Map(list.map((a) => [a.id, a.connected]))
  renderFeedAccounts()
}

export const refreshFeedAccounts = async () => setAccounts(await api.feedAccounts())

const statusText = (connected: boolean | undefined) => {
  if (connected === undefined) {
    return "Checking"
  }
  return connected ? "Connected" : "Not connected"
}

const disconnect = async (page: FeedPage) => {
  try {
    setAccounts(await api.feedDisconnect(page.id))
    toast(`Disconnected ${page.site}`)
  } catch (err) {
    toast(messageOf(err))
  }
}

const accountRow = (page: FeedPage) => {
  const connected = accounts.get(page.id)
  const row = el("div", "feed-account-row")
  const status = el("span", `account-status${connected ? " connected" : ""}`, statusText(connected))
  const signIn = el("button", "ghost", connected ? "Sign in again" : "Sign in")
  signIn.onclick = () => void api.feedSignIn(page.id)
  const clear = el("button", "ghost", "Disconnect")
  clear.title = `Sign out and clear ${page.site} cookies and site data`
  clear.onclick = () => void disconnect(page)
  row.append(el("span", null, page.site), status, signIn, clear)
  return row
}

export const renderFeedAccounts = () => {
  $("#feed-account-rows").replaceChildren(...FEED_PAGES.map(accountRow))
}

export const wireFeedAccounts = () => {
  api.onFeedAccounts(setAccounts)
}
