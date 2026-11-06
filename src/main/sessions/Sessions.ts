// Sessions API used by IPC and boot; backed by the coordinator.

import { Context, type Effect } from "effect"
import type { ChatEvent } from "../../shared/chat.ts"
import type { ChatImage } from "../../shared/images.ts"
import type { AccountId, DirPath, FilePath, RequestId, SessionId } from "../../shared/ids.ts"
import type { PermissionDecision } from "../../shared/ipc.ts"
import type { NewMaster, SessionView } from "../../shared/session.ts"
import type { Settings } from "../../shared/settings.ts"
import type { AccountInUse } from "../accounts/actions.ts"

export interface SessionsShape {
  readonly list: Effect.Effect<ReadonlyArray<SessionView>>
  readonly get: (id: SessionId) => Effect.Effect<SessionView | null>
  readonly createMaster: (options: NewMaster) => Effect.Effect<SessionView>
  readonly rename: (id: SessionId, name: string) => Effect.Effect<void>
  readonly close: (id: SessionId) => Effect.Effect<void>
  readonly reopen: (id: SessionId) => Effect.Effect<void>
  // Workers only; archived ones keep their transcript
  readonly archive: (id: SessionId) => Effect.Effect<void>
  readonly unarchive: (id: SessionId) => Effect.Effect<void>
  readonly remove: (id: SessionId) => Effect.Effect<void>
  readonly chatSend: (id: SessionId, text: string, images: ReadonlyArray<ChatImage>, files: ReadonlyArray<FilePath>) => Effect.Effect<void>
  readonly chatInterrupt: (id: SessionId) => Effect.Effect<void>
  readonly setModel: (id: SessionId, model: string) => Effect.Effect<void>
  readonly setEffort: (id: SessionId, effort: string) => Effect.Effect<void>
  readonly chatRespond: (id: SessionId, requestId: RequestId, decision: PermissionDecision) => Effect.Effect<boolean>
  readonly chatHistory: (id: SessionId) => Effect.Effect<ReadonlyArray<ChatEvent>>
  readonly switchAccount: (to: AccountId) => Effect.Effect<Settings>
  readonly removeAccount: (id: AccountId) => Effect.Effect<Settings, AccountInUse>
  // Folders whose project skills apply
  readonly projectDirs: Effect.Effect<ReadonlyArray<DirPath>>
  // Interrupts running work
  readonly restartCoordinator: Effect.Effect<void>
}

export class Sessions extends Context.Service<Sessions, SessionsShape>()("daycare/Sessions") {}
