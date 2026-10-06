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
- **TypeScript** everywhere, checked with `bun run typecheck`. The renderer is
  plain DOM, no framework.

## Scripts

| Command | What it does |
| --- | --- |
| `bun start` | Build and launch from the checkout |
| `bun run build` | Bundle main, preload and renderer into `dist/` |
| `bun run typecheck` | `tsc --noEmit` over `src`, `test`, `scripts` |
| `bun test` | Unit and integration tests |
| `bun run package` | Build `Daycare.app` and install it to `/Applications` (`-- --no-install` to only build into `out/`) |
| `scripts/update.sh` | Pull main, reinstall deps if they changed, repackage (what Settings > Update runs) |
| `bun scripts/dev-control.ts <out.json>` | Run the control server alone and write an MCP config for a real `claude` |

## Dev environment variables

Set `DAYCARE_USER_DATA` whenever you launch from the checkout. The app is
named `Daycare` like the installed build, so without it the dev run restores
and spawns your real sessions.

| Variable | Effect |
| --- | --- |
| `DAYCARE_USER_DATA=$(mktemp -d)` | Isolated settings and sessions |
| `DAYCARE_CLAUDE=/path/to/claude` | Use this `claude` binary |
| `DAYCARE_AUTOSTART='{"task":"...","cwd":"..."}'` | Start a master on launch |
| `DAYCARE_DEMO='{"workers":3,"kind":"terminal"}'` | Start a master with that many workers (`kind`, `workerKind`, `cwd`, `name` optional) |
| `DAYCARE_EVAL='[[ms, "js"], ...]'` | Run renderer JS at each delay |
| `DAYCARE_SNAPSHOT=/dir` | Write a screenshot and `state.json` every 5s |

Test with a real `claude` only in a folder it already trusts. In a new folder
it waits on the trust prompt and no hooks fire.

## Layout

```
src/
  shared/      types and the IPC contract used by both sides
  preload/     the window.daycare bridge
  main/
    main.ts    the layer graph
    electron/  window, IPC handlers, paths, app icon, boot
    sessions/  PTY and chat sessions, persistence, transcripts
    control/   HTTP server for Claude Code hooks and the master's MCP tools
    chat/      stream-json normalizer and the chat child process
    skills/    skills inventory
    settings/  settings store
    usage/     plan usage pacing
    power/     keep awake
    updater/   Settings > Update
  renderer/
    main.ts    entry: loads settings, wires every view
    sessions.ts, sidebar.ts, layout.ts, meters.ts, settings-view.ts, sheet.ts, shortcuts.ts
    chat/      chat pane
    skills/    Settings > Skills and the skills rail
test/          bun test suites
scripts/       build, package, update, dev tools
assets/        fonts, sprites, logos, app icon
```

## How it talks to Claude Code

- Hooks are Claude Code native `type: "http"` hooks posting to `/hook/:id`,
  with the token header interpolated from `$DAYCARE_TOKEN`.
- The master's tools are an HTTP MCP server at `/mcp/:id`, configured through
  a 0600 file under `userData/mcp/`.
