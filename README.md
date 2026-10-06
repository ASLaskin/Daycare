# Daycare

Desktop orchestrator for Claude Code. A master session splits work and spawns
workers; every worker is a full interactive Claude Code session you can type
into directly. Runs on your own subscription, no API keys.

Rewrite of Konductor on Electron, Bun, Effect and TypeScript.

```sh
bun install
bun run rebuild   # node-pty against Electron's ABI
bun start
```

## Stack

- **Electron** for the window, PTYs and native menus. Main and preload run in
  Electron's own Node.
- **Bun** installs packages, bundles all three targets (`scripts/build.ts`) and
  runs the tests (`bun test`).
- **Effect** structures the main process: each concern is a service with a
  layer, resources are scoped so quitting cleans everything up, and every
  payload crossing a boundary is decoded with `Schema`.
- **TypeScript** everywhere, checked with `bun run typecheck`.
