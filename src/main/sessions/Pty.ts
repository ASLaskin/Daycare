// A service because node-pty targets Electron's ABI.

import { Context } from "effect"

export interface PtyProcess {
  readonly write: (data: string) => void
  readonly resize: (cols: number, rows: number) => void
  readonly kill: () => void
  readonly onData: (listener: (data: string) => void) => void
  readonly onExit: (listener: () => void) => void
}

export interface PtyOptions {
  readonly cols: number
  readonly rows: number
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

export class Pty extends Context.Service<Pty, { readonly spawn: (file: string, args: ReadonlyArray<string>, options: PtyOptions) => PtyProcess }>()(
  "daycare/Pty",
) {}
