// Pty backed by node-pty.

import { Layer } from "effect"
import * as pty from "node-pty"
import { Pty } from "./Pty.ts"

export const NodePty = Layer.succeed(
  Pty,
  Pty.of({
    spawn: (file, args, options) => {
      const proc = pty.spawn(file, [...args], { name: "xterm-256color", ...options, env: options.env as Record<string, string> })
      return {
        write: (data) => proc.write(data),
        resize: (cols, rows) => proc.resize(cols, rows),
        kill: () => proc.kill(),
        onData: (listener) => void proc.onData(listener),
        onExit: (listener) => void proc.onExit(() => listener()),
      }
    },
  }),
)
