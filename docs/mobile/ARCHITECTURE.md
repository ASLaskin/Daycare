# Phone app architecture

Personal iOS client for Daycare. Wire contract: `PROTOCOL.md` and `src/shared/mobile.ts`.

```
iPhone (Tailscale) ──wss──▶ coordinator gateway ──▶ hub (sessions, approvals, power)
                                  │                   ▲
                                  └── APNs (HTTP/2)   └── unix socket ◀── Electron (optional; launchd keeps the coordinator up)
```

## Foundation (done)

The coordinator side the gateway builds on.

1. **The coordinator is the only session backend.** The in Electron path (`Sessions.layer`, `sessions.json`, the Chat service, the loopback control server) is deleted on every platform; there is no opt in or fallback flag. Old `sessions.json` sessions are not migrated. Desktop notifications, usage refreshes and ooga booga mode moved onto the coordinator path (`src/main/coordinator/alerts.ts`, `configure.oogaBooga`).
2. **launchd supervises the coordinator on macOS.** `src/main/coordinator/launchd.ts` writes `~/Library/LaunchAgents/com.daycare.coordinator.plist` on every app launch (like the systemd unit on Linux) with `RunAtLoad` and `KeepAlive {SuccessfulExit: false}`: it starts at login and restarts after any non zero exit, while a clean SIGTERM stop (exit 0) stays stopped. launchd has no "except exit 3", so a coordinator refused by the lock retries every 10 s (`ThrottleInterval`) and takes over once the other owner stops. A changed plist is reloaded only when no coordinator is running; otherwise it applies on the next restart (`restartCoordinator` stops it, then `bootout` and `bootstrap`). The app pins `DAYCARE_RUNTIME_DIR` in the plist because launchd may hand the agent a different `TMPDIR`. Logs: `~/Library/Logs/Daycare/coordinator.log`. Chosen over the detached spawn because it is the only macOS supervisor that survives crashes and reboots without the app, and it fits the existing lock: launchd guarantees one instance of the job, the flock still guards against strays.
3. **Coordinator `send` carries images and files.** `SendCommand` has `images: ChatImage[]` and `files: FilePath[]`. Claude gets base64 image blocks ahead of the text; Codex gets `{type: "image", url: <data url>}` inputs. Files become `Attached file:` lines ahead of the text, built by the hub (`providerText`). The recorded `user` event keeps text, images and files separately, as the desktop renders it. A user event over the 1 MiB entry limit drops its images (counted in `omittedImages`) before falling back to an `oversized` preview.
4. **History entries and resume hooks.** Entries come from a per session counter (`sessions.last_entry`, migration 6), so a streamed `text-delta` row removed when its `text` arrives never has its entry reused. `history.record` returns the entry, rows store their time (`history.at`), hub `chat` events carry `entry`, `send` returns `{accepted, entry}`. The hub has a random `epoch` per start (also in the socket snapshot), `observe`, `state`, `page`, `summary`. The replay ring buffer itself is gateway work (`gateway/replay.ts`) hanging off `observe`.
5. **`hub.subscribe` always loads every transcript.** Still true for the desktop socket; the gateway uses `hub.state()` and `hub.page()` instead.
6. **Session creation depends on Electron settings.** Solved by the pushed catalog: the desktop sends `catalog {DesktopCatalog}` on connect and on settings change (`src/main/coordinator/catalog.ts`); the hub persists it (config row `catalog`) and the gateway fills phone creates from it (`gateway/catalog.ts`).
7. **Keep awake runs in the coordinator.** See Power.
8. **Lid closed keep awake stays, desktop only.** It needs an admin password dialog, so the Electron app keeps running it (`src/main/power/LidMachine.ts`) from the coordinator's mode and busy count, and reports `{enabled, active}` with the socket `lid` command. The coordinator exposes it read only as `PowerState.lidClosed` and clears it when that desktop connection closes (the root watchdog restores sleep when the app exits).

### Hub API for the gateway (`src/coordinator/hub.ts`)

All synchronous unless noted; the gateway runs in the coordinator process and calls the hub directly.

| call | returns | notes |
|---|---|---|
| `hub.epoch` | `Epoch` | random per coordinator start |
| `hub.observe((seq, event) => void)` | unsubscribe | every numbered `HubEvent`, in broadcast order, before socket subscribers |
| `hub.state()` | `{epoch, seq, sessions, approvals, power, unavailable}` | no history; call in the same tick as `observe` setup for a gapless snapshot |
| `hub.page(session, cursor, limit)` | `HistoryPage \| null` | cursor `null`, `{before}` or `{after}`; 1 MiB budget; null for unknown sessions. The gateway clamps `limit` to `MAX_PAGE` |
| `hub.summary(session)` | `{lastEntry, lastEventAt, preview} \| null` | for `MobileSession` |
| `hub.send(session, {text, images, files})` | `{accepted: "coordinator", entry}` | throws like the `send` command (closed, stopping, no such session) |
| `hub.command(cmd)` | `{result} \| {error}` | socket commands, including `power {mode}` |
| `hub.media(session)` | `MediaItem[]` | mentioned media still on disk, newest mention first |
| `hub.resolveMedia(session, absolutePath)` | `MediaItem \| null` | the only check the media endpoint needs |
| `hub.battery(reading)` | | fed by `main.ts` polling `pmset` |

`HubEvent` kinds: `session`, `chat {session, entry, event}`, `approval`, `removed`, `power {power}`, `media {session, items}`, `catalog {catalog: DesktopCatalog}`. `hub.state()` also carries `catalog`, and `hub.catalog()` returns the last pushed one.

### Media (`src/coordinator/media.ts`)

Top priority on the phone is viewing images and videos agents write to disk.

* Candidates come from every chat event: all strings in tool inputs (Write `file_path`, Bash commands such as `ffmpeg … out.mp4`), tool output, assistant text and user files. Only names with a media extension are considered, so most events never touch the disk.
* A candidate is resolved against the session cwd (`~` expanded), `realpath`ed, must be a regular non empty file, and its type is **sniffed from its leading bytes** (PNG, JPEG, GIF, WebP, BMP, HEIC/HEIF/AVIF, MP4/M4V, MOV, WebM, MP3, M4A, WAV, OGG, FLAC). Extensions only prefilter. SVG is not served.
* A tool start's candidates are rechecked at its tool end, so a file the tool creates is found once it exists. New files (or changed size or mtime) are broadcast as one `media` hub event per chat event.
* `resolveMedia` allows a file only if it is mentioned in that session's events (history is scanned once per session, then kept current from live events) or its real path is inside the session's real cwd. Symlinks out of the cwd are refused unless their target is itself mentioned. Everything must sniff as media.
* The HTTP endpoint (`gateway/mediaHttp.ts`): `GET` or `HEAD /media/<session>?path=<absolute path>` (`mediaUrlPath` in `mobile.ts`) with `Authorization: Bearer <token>` (401 otherwise). `hub.resolveMedia` is the only allow check (404 otherwise); the file streams through `src/shared/fileResponse.ts` (shared with the desktop `MediaProtocol.ts`, ranges parsed by `src/shared/range.ts`) with `Content-Type: item.mimeType`, `Accept-Ranges: bytes`, 206 partial responses and 416 when unsatisfiable. AVPlayer needs Range support to play mp4.

## Coordinator changes

New folders under `src/coordinator/`; each file one concern. All done.

```
src/coordinator/
  gateway/
    gateway.ts       config lifecycle, Tailscale binding and retries, connections, replay, PairingInfo
    config.ts        load and create gateway.json (port, token, apns block), rotate the token
    tailscale.ts     find tailscale CLI, addresses and MagicDNS name from `status --json`; run `tailscale cert`
    tls.ts           cert and key under mobile/tls, expiry
    listener.ts      Bun.serve wss and /media per Tailscale address
    connection.ts    hello, auth, watch filter, pings, backpressure, close codes
    auth.ts          constant time token check, failure slowdown, Bearer parsing
    replay.ts        bounded event ring buffer
    snapshot.ts      slim snapshot, MobileSession previews, hub events to phone events
    commands.ts      MobileCommand to hub calls, error codes
    outcome.ts       command outcome and hub error mapping
    idempotency.ts   mobile_requests table
    uploads.ts       save uploads under attachments/
    catalog.ts       fill create defaults from the DesktopCatalog, allowed folders
    mediaHttp.ts     GET /media with Range
    route.ts         desktop `pairing`, `pairing-rotate`, `pairing-setup` socket commands
  power/             (done)
    assertion.ts     hold or release `caffeinate -i -w <pid>`
    battery.ts       poll and parse `pmset -g batt`
    power.ts         mode + busy count + battery + lid to PowerState, persisted mode
  media.ts           (done) media a session mentions, sniffed types, serving rules
  push/
    push.ts          hub events to APNs; off while the apns block is incomplete
    apnsConfig.ts    apns block and .p8 key, missing fields
    apns.ts          ES256 JWT from the .p8, HTTP/2 client, error handling
    devices.ts       mobile_devices and mobile_activities tables
    alerts.ts        hub events to alert pushes
    activity.ts      ActivityState builder, coalescing, start and end
```

### Hub additions (done)

* Entries, `observe`, `state`, `page`, `summary`, `send` with entry, `power` and `media` events, `power` and `lid` socket commands, config row `keep_awake` (see Foundation).
* `HubEvent` `catalog`; `hub.state()` and `hub.catalog()` carry the `DesktopCatalog`.
* Socket commands for the desktop: `catalog {catalog: DesktopCatalog}`, `pairing {}` (returns `PairingInfo`, or null before setup), `pairing-rotate {}`, `pairing-setup {}`. The pairing ones are answered by the gateway through `listen`'s route hook, not the hub.
* Migration 7: `mobile_requests(key, device, method, result, created_at)`, `mobile_devices(device, apns_token, environment, push_to_start, kinds, updated_at)`, `mobile_activities(activity, device, token, updated_at)`; config row `catalog`.

### Gateway runtime

* `main.ts` starts the gateway after `listen` succeeds, only when `gateway.json` exists (created by "Set up phone" in Settings). Gateway failure never stops the socket server; it is reported through `PairingInfo.error`.
* Tailscale CLI: first of `DAYCARE_TAILSCALE`, `tailscale` on PATH, `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. Name (`Self.DNSName`, trailing dot removed) and addresses (`Self.TailscaleIPs`) from `tailscale status --json`.
* Port in use, Tailscale stopped, MagicDNS off or certs off: logged once per distinct message, shown in Settings, retried every 30 s.
* If Tailscale is down at start, retry every 30 s. Re-check every 5 minutes; if addresses change, rebind.
* Certs: `tailscale cert --cert-file … --key-file … <name>` into `mobile/tls/` on start and every 24 h. The command only renews near expiry. On change, restart the listeners; phones resume.
* Uses `Bun.serve` with `websocket` and `tls`. `server.ts` only gained the route hook for pairing commands; both share one hub.
* A listener restart (address or cert change) closes phones with 1012 so they resume; rotation closes them with 4401; coordinator stop with 4503.

### Power (`src/coordinator/power/`, done)

* `assertion.ts` spawns `/usr/bin/caffeinate -i -w <coordinator pid>` while holding: idle system sleep is blocked, the display may sleep and the screen may lock. `-w` ends it if the coordinator dies. An unexpected exit is reported in `PowerState.error` until the mode is set again.
* `power.ts`: `holding = mode == "always" || (mode == "while-running" && busyCount > 0)`, where busy is state `running` or `creating` with a live provider, recounted on every session refresh. Mode persists in the config table (`keep_awake`); default `while-running`. Changes are broadcast as `power` hub events; a new battery reading time alone is not a change.
* `battery.ts` runs `pmset -g batt` every 60 s (20 s when discharging below 25%) and parses `NN%; charging|discharging|charged|finishing charge|AC attached; H:MM remaining|(no estimate)`. Null on Macs without a battery. Linux: no assertion, no battery, and `error` says keep awake needs macOS when a mode wants it.
* Socket commands: `power {mode, initial?}` (`initial` sets only when no mode is stored; the desktop uses it once to carry over the old `settings.json` `keepAwake`), `lid {lid}` (desktop only).
* Desktop: `settings.keepAwake` is gone; Settings writes the mode with the `power` command and renders `PowerState` from the socket. Lid closed keep awake stays in Electron as above. `ElectronPowerBlocker.ts` and `PowerBlocker.ts` are deleted.

## Desktop pairing (done)

* New Settings section "Phone" (`src/renderer/settings-phone.ts`), backed by IPC `phone:pairing`, `phone:rotate`, `phone:setup` in main, which forward to the socket `pairing` commands.
* "Set up phone" creates `gateway.json` with a fresh token and port 7443; the coordinator starts the gateway.
* The section shows the QR (encoded in the renderer from `PairingInfo.url`, using a small pinned QR encoder dependency such as `qrcode-generator`), host and port, cert expiry, APNs status (`apnsMissing`), and errors such as "Tailscale is not running" or "HTTPS certificates are off for this tailnet".
* "New pairing code" calls `pairing-rotate`.
* The desktop also pushes `DesktopCatalog` on connect and on settings change, next to `makeWorkerModelsSync`.

## Config and secrets

All under `~/Library/Application Support/Daycare/mobile/`, directory 0700, files 0600, never in the repo. Override with `DAYCARE_MOBILE_DIR` for tests.

```
gateway.json
  { "port": 7443,
    "token": "<base64url>",
    "apns": { "keyFile": "AuthKey_ABC123DEFG.p8", "keyId": "ABC123DEFG",
              "teamId": "TEAM123456", "bundleId": "com.example.daycare",
              "environment": "development" } }
AuthKey_ABC123DEFG.p8      copied here by hand from the Apple developer portal
tls/<name>.crt, tls/<name>.key
```

* The `apns` block is edited by hand; push stays off (and Settings lists what is missing) until all fields are present and the key file is readable.
* JWT: ES256, header `kid`, claims `iss` = team id and `iat`; cached and refreshed every 50 minutes.
* Host `api.sandbox.push.apple.com` for `development`, `api.push.apple.com` for `production`. A device's registered `environment` wins over the file.
* Devices, Live Activity tokens and idempotency keys are in `coordinator.db`; none are secrets.

## iOS app

Lives in `ios/` in this repo. Minimum iOS 18. Project generated with XcodeGen from `ios/project.yml` (the `.xcodeproj` is gitignored), so agents edit YAML, not `project.pbxproj`.

```
ios/
  project.yml
  Local.xcconfig.example    DEVELOPMENT_TEAM, BUNDLE_ID_PREFIX (copy to Local.xcconfig, gitignored)
  DaycareKit/               Swift package shared by both targets
    Sources/Wire/           Codable mirrors of src/shared/mobile.ts and ChatEvent
    Sources/Activity/       DaycareActivityAttributes (must be identical in app and extension)
    Tests/WireTests/        decode fixtures produced by a bun script from the TS schemas
  Daycare/                  app target
    App/                    DaycareApp, scene phase, AppDelegate for push registration
    Connection/             Gateway (URLSessionWebSocketTask), reconnect, NWPathMonitor
    Store/                  observable state, transcript cache, last epoch and seq
    Outbox/                 persisted queue, retry policy
    Pairing/                QR scanner (VisionKit DataScannerViewController), Keychain
    Features/               Sessions, Transcript, Composer, Approvals, NewSession, Power
    Push/                   registration, notification delegate, deep links
    Activity/               start, end, token reporting
  DaycareWidgets/           widget extension target
    LiveActivity.swift      lock screen and Dynamic Island views
    StatusWidget.swift      accessory lock screen widget from the App Group cache
```

Targets and capabilities:

* **Daycare** (app): Push Notifications (`aps-environment` development), App Groups (`group.<prefix>.daycare`), Keychain, `NSCameraUsageDescription`, `NSSupportsLiveActivities` and `NSSupportsLiveActivitiesFrequentUpdates`, URL scheme `daycare` for pairing links.
* **DaycareWidgets** (widget extension): App Groups, `NSSupportsLiveActivities`. Reads the last state the app wrote to the App Group; static widgets cannot be pushed, so the Live Activity is the live surface.

Behavior:

* Connection: open on foreground, close on background (iOS suspends sockets anyway). Reconnect on `NWPathMonitor` changes and with backoff. Always `hello` with the stored resume point and current watch.
* Store: transcript cache is one JSON file per session (`TranscriptCache.swift`) keyed by `entry`, so reconnects and coordinator restarts only fetch `after`.
* Outbox: SQLite table `(key, session, method, payload, attachments, state, attempts, createdAt)`. Drained after `welcome`, in order, one in flight per session. Uploads first, each with its own key (`<item key>:<index>`), then `send` with the returned paths. Retry rules follow the error table in `PROTOCOL.md`. Items survive app kill.
* Tailscale on the phone: enable VPN On Demand in the Tailscale app so the tunnel is up when Daycare opens.

### Building onto the phone

1. Apple developer portal: register bundle id with Push Notifications and App Groups; create the App Group; create an APNs auth key, download the `.p8` once into `~/Library/Application Support/Daycare/mobile/`, and fill the `apns` block.
2. Tailscale admin: enable MagicDNS and HTTPS certificates. Prefer the standalone Tailscale for Mac over the App Store build; the sandboxed build may not write cert files outside its container.
3. `brew install xcodegen`, copy `Local.xcconfig.example` to `Local.xcconfig` with your team id, `cd ios && xcodegen generate`, open `Daycare.xcodeproj`.
4. iPhone: enable Developer Mode (Settings, Privacy and Security), connect by cable once, then select it and Run. Later runs work over the network.
5. Paid account profiles last a year; rerun from Xcode to renew. Builds use the development APNs environment.

## Decisions

* Coordinator is the macOS default and the only backend; the in Electron session path is deleted with no fallback flag.
* The coordinator survives window close, crashes and reboots: launchd LaunchAgent on macOS, systemd user service on Linux.
* Lid closed keep awake is kept, desktop only. Phones toggle keep awake (`always`) and allow sleep (`off`) only; `PhoneKeepAwake` refuses `while-running`, which phones display read only along with `lidClosed`.
* The phone fetches Mac files: media (images, video, audio) mentioned by a session or under its cwd, through `hub.resolveMedia` and the gateway's `/media` endpoint.

## Open questions

* Should notification actions (Allow, Deny on the approval banner) answer from the lock screen? Needs a short background connection; left out of v1.
* Should non media files (PDF, text) also be fetchable? Same resolver shape with a different type check.
