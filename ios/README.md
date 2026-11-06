# Daycare for iPhone

Native SwiftUI client for the Daycare coordinator's phone gateway. Personal sideload through Xcode with a paid Apple developer account; it never goes to the App Store. Wire contract: `docs/mobile/PROTOCOL.md` and `src/shared/mobile.ts`.

## Layout

```
ios/
  project.yml               XcodeGen spec (Daycare.xcodeproj is generated and gitignored)
  Config/Base.xcconfig      defaults; includes Local.xcconfig when present
  Local.xcconfig.example    copy to Local.xcconfig with your team and bundle prefix
  DaycareKit/               Swift package used by the app and the widget extension
    Sources/Wire/           Codable mirrors of src/shared/mobile.ts, chat.ts, power.ts
    Sources/Activity/       Live Activity attributes and content state, widget cache
    Sources/Sync/           transcript merge, retry policy, pairing link, formatting
    Sources/Media/          media URL construction (the only place it is built)
    Tests/                  fixture decoding and logic tests
  Daycare/                  app target
  DaycareWidgets/           Live Activity and lock screen widget extension
  scripts/fixtures.ts       writes test fixtures, each validated by the TS schemas
```

## Put it on your phone

You need: a Mac with Xcode 26 or later, a paid Apple developer account, an iPhone on iOS 18 or later, and Tailscale signed in to the same tailnet on both.

### 1. Apple developer portal (developer.apple.com, Certificates, Identifiers and Profiles)

Pick a bundle prefix you own, for example `com.yourname`. The app is `<prefix>.daycare`, the widget extension is `<prefix>.daycare.widgets`.

1. Identifiers, App Groups: register `group.<prefix>.daycare`.
2. Identifiers, App IDs: register `<prefix>.daycare` with **Push Notifications** and **App Groups** (assign the group above).
3. Identifiers, App IDs: register `<prefix>.daycare.widgets` with **App Groups** (same group).
4. Keys: create a key with **Apple Push Notifications service (APNs)**. Download `AuthKey_<KEYID>.p8`. Apple lets you download it only once. Note the Key ID and your Team ID (Membership details).

Xcode's automatic signing can create steps 1 to 3 for you on the first build; step 4 is always manual.

### 2. APNs key on the Mac

```sh
mkdir -p ~/Library/Application\ Support/Daycare/mobile
chmod 700 ~/Library/Application\ Support/Daycare/mobile
mv ~/Downloads/AuthKey_<KEYID>.p8 ~/Library/Application\ Support/Daycare/mobile/
chmod 600 ~/Library/Application\ Support/Daycare/mobile/AuthKey_<KEYID>.p8
```

Then add the `apns` block to `~/Library/Application Support/Daycare/mobile/gateway.json` (the file appears after "Set up phone" in Daycare Settings, Phone):

```json
"apns": {
  "keyFile": "AuthKey_<KEYID>.p8",
  "keyId": "<KEYID>",
  "teamId": "<TEAMID>",
  "bundleId": "<prefix>.daycare",
  "environment": "development"
}
```

Xcode builds always use the **development** (sandbox) APNs environment. Settings, Phone on the Mac lists anything still missing.

### 3. Tailscale

* Admin console, DNS: enable **MagicDNS** and **HTTPS Certificates**.
* On the Mac, prefer the standalone Tailscale download over the App Store build (the sandboxed build may not write cert files).
* On the iPhone, enable **VPN On Demand** in the Tailscale app so the tunnel is up whenever Daycare opens.

### 4. Generate the project and build

```sh
brew install xcodegen          # or unzip the release from github.com/yonaskolb/XcodeGen
cd ios
cp Local.xcconfig.example Local.xcconfig
# edit Local.xcconfig: DEVELOPMENT_TEAM = <TEAMID>, BUNDLE_ID_PREFIX = <prefix>
xcodegen generate
open Daycare.xcodeproj
```

In Xcode, check both targets (Daycare, DaycareWidgets) under Signing and Capabilities show your team and no errors. Push Notifications and App Groups come from `project.yml`; do not add them by hand (regenerating would drop them anyway).

### 5. iPhone

1. Connect by cable once. Settings, Privacy and Security, **Developer Mode**: on, restart, confirm.
2. In Xcode pick the phone as the run destination and press Run. Later runs work over the network when the phone is on the same WiFi.
3. If iOS says the developer is untrusted: Settings, General, VPN and Device Management, trust your team.
4. Allow notifications when asked. For the lock screen surface: Settings, Daycare, **Live Activities** on, and add the Daycare widget to the lock screen.

### 6. Pair

On the Mac: Daycare Settings, Phone, **Set up phone**. Scan the QR code with the app's pairing screen (or the iPhone Camera app, which opens the `daycare://pair` link). Host, port and token go to the Keychain. "New pairing code" on the Mac revokes the phone; the app then asks you to scan again.

### Renewal

Paid account profiles last a year. When the app stops launching, rerun it from Xcode.

## Tests

```sh
cd ios/DaycareKit && swift test                      # host, fastest
bun ios/scripts/fixtures.ts                          # from the repo root, after any schema change
```

`fixtures.ts` builds a sample of every client frame, server frame, chat event and result, decodes each through the Effect schemas in `src/shared`, and writes them to `DaycareKit/Tests/WireTests/Fixtures`. The Swift tests then decode every fixture and encode client frames again to the same JSON, so a schema change that the Swift models miss fails the tests.

## Behavior notes

* Connection opens on foreground and closes on background. Reconnects on network changes and with backoff (1 s doubling to 30 s). After a reconnect within one launch it resumes from the last `seq`; after a cold launch it takes a fresh slim snapshot.
* Transcripts are cached per session on disk (last 1500 rows). Opening a session pages forward with `history {after}` from the cache, or fetches the newest page when the cache is more than 600 entries behind.
* Every user action goes through the outbox (`Application Support/outbox`): one item in flight per session, photos uploaded first with keys `<item key>:<index>`, retries per the PROTOCOL.md error table. Items survive app kill.
* Media: images and videos from `media` events and the `media` command are shown inline next to the transcript row that mentions them, and in a per session gallery. Video and audio stream through AVPlayer with HTTP Range from the gateway. URL and auth headers are built only in `DaycareKit/Sources/Media/MediaRoute.swift`.
* Notification taps open the approval, the finished session, or the Power tab. There are no lock screen action buttons.
