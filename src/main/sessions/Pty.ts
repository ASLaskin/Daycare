// A pseudo terminal, behind a service so Sessions can be tested without the
// native node-pty module (which is built for Electron's ABI, not Bun's).

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
