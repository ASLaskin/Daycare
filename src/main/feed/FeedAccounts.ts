// Instagram and YouTube sign in for the feed partition.

import { Context, type Effect } from "effect"
import type { FeedAccount } from "../../shared/feed.ts"
import type { FeedTab } from "../../shared/settings.ts"

export interface FeedAccountsShape {
  readonly list: Effect.Effect<ReadonlyArray<FeedAccount>>
  // Opens a sign in window that closes once signed in
  readonly signIn: (id: FeedTab) => Effect.Effect<void>
  // Clears the site's cookies and storage
  readonly disconnect: (id: FeedTab) => Effect.Effect<ReadonlyArray<FeedAccount>>
}

export class FeedAccounts extends Context.Service<FeedAccounts, FeedAccountsShape>()("daycare/FeedAccounts") {}
