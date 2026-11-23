// Writes wire fixtures for the Swift tests, each checked against the TS schemas.
// Run from the repo root: bun ios/scripts/fixtures.ts

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { ChatEvent } from "../../src/shared/chat.ts"
import {
  ActivityState,
  CreateResult,
  HistoryPage,
  MediaList,
  MobileClientMessage,
  MobileServerMessage,
  PushData,
  SendResult,
  UploadResult,
} from "../../src/shared/mobile.ts"

const out = join(import.meta.dir, "../DaycareKit/Tests/WireTests/Fixtures")

const battery = { percent: 64, pluggedIn: false, charging: false, minutesRemaining: 185, readAt: 1762300000000 }
const power = { mode: "while-running", holding: true, busyCount: 2, battery, lidClosed: { enabled: false, active: false }, error: null }

const session = {
  id: "s-master",
  provider: "claude",
  nativeId: "native-1",
  role: "master",
  parentId: null,
  name: "Ada",
  icon: "fox",
  cwd: "/Users/me/code/app",
  model: "opus",
  effort: "high",
  permissionMode: "default",
  state: "running",
  closed: false,
  archived: false,
  error: null,
  createdAt: 1762300000000,
  run: 2,
  accountId: "default",
  configDir: null,
  live: true,
  lastEntry: 41,
  lastEventAt: 1762300050000,
  preview: "Looking at the tests now",
}

const worker = { ...session, id: "s-worker", role: "worker", parentId: "s-master", name: "Bo", nativeId: null, icon: null, model: null, effort: null, state: "idle", live: false, lastEntry: null, lastEventAt: null, preview: null, configDir: "/Users/me/.claude-work" }

const permission = {
  kind: "permission",
  requestId: "req-1",
  toolUseId: "tool-1",
  name: "Bash",
  title: "Run npm test",
  input: { command: "npm test", timeout: 120 },
  description: "Runs the test suite",
  suggestions: [{ type: "addRules", rules: [{ toolName: "Bash" }] }],
  requiresUserInteraction: false,
  choices: ["allow", "always", "deny"],
}

const approval = { session: "s-master", request: "req-1", choices: ["allow", "always", "deny"], event: permission }

const catalog = {
  locations: [{ label: "app", path: "/Users/me/code/app" }],
  accounts: [{ id: "default", label: "Default" }, { id: "work", label: "Work" }],
  activeAccount: "default",
  defaultLocation: "/Users/me/code/app",
  provider: "claude",
  model: "opus",
  effort: "high",
  permissionMode: "acceptEdits",
  models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }],
  efforts: [{ id: "low", label: "Low" }, { id: "high", label: "High" }],
}

const media = {
  path: "/Users/me/code/app/out/demo.mp4",
  name: "demo.mp4",
  mimeType: "video/mp4",
  kind: "video",
  size: 4812000,
  modifiedAt: 1762300040000,
  entry: 40,
}

const chatEvents: Record<string, object> = {
  ready: { kind: "ready", claudeSessionId: "c-1", model: "opus", cwd: "/Users/me/code/app", tools: ["Bash", "Read"], slashCommands: ["/compact"] },
  state: { kind: "state", state: "running" },
  "text-delta": { kind: "text-delta", block: "b1", text: "Hel" },
  text: { kind: "text", block: "b1", text: "Hello there" },
  thinking: { kind: "thinking", block: "b0", text: "Considering", tokens: 120 },
  "tool-start": { kind: "tool-start", toolUseId: "tool-1", name: "Bash", title: "npm test", input: { command: "npm test" }, parentToolUseId: null },
  "tool-end": { kind: "tool-end", toolUseId: "tool-1", isError: false, content: "3 passed", structured: { passed: 3 } },
  task: { kind: "task", taskId: "task-1", status: "running", description: "Review", subagentType: "Explore", summary: "", lastTool: "Read", usage: { tokens: 10 } },
  "turn-end": { kind: "turn-end", isError: false, stopReason: "end_turn", costUsd: 0.42, contextTokens: 51000, numTurns: 3, durationMs: 9100, text: "Done" },
  permission,
  "permission-resolved": { kind: "permission-resolved", requestId: "req-1", allowed: false, reason: "cancelled" },
  user: { kind: "user", text: "Attached file: /tmp/a.png\nLook at this", images: [{ mediaType: "image/png", data: "iVBORw0KGgo=" }], omittedImages: 0, files: ["/tmp/a.png"] },
  "user-legacy": { kind: "user", text: "hi", images: [], omittedImages: 1 },
  "rate-limit": { kind: "rate-limit", percent: 80 },
  error: { kind: "error", message: "boom" },
  interrupted: { kind: "interrupted", reason: "provider exited" },
  notice: { kind: "notice", message: "Sandbox weakened" },
  exit: { kind: "exit", code: 1, stderrTail: "fatal" },
  "history-evicted": { kind: "history-evicted" },
  oversized: { kind: "oversized", original: "tool-end", bytes: 2000000, preview: "…" },
}

const server: Record<string, object> = {
  welcome: { type: "welcome", protocol: 1, coordinator: "0.2.0", epoch: "ep-1", resumed: false },
  snapshot: { type: "snapshot", epoch: "ep-1", seq: 4182, sessions: [session, worker], approvals: [approval], power, catalog, unavailable: ["codex"] },
  "snapshot-empty": { type: "snapshot", epoch: "ep-1", seq: 0, sessions: [], approvals: [], power: { ...power, battery: null, lidClosed: null }, catalog: null, unavailable: [] },
  "event-session": { type: "event", seq: 4183, event: { kind: "session", session } },
  "event-removed": { type: "event", seq: 4184, event: { kind: "removed", session: "s-worker", parentId: "s-master" } },
  "event-approval": { type: "event", seq: 4185, event: { kind: "approval", approval } },
  "event-approval-resolved": { type: "event", seq: 4186, event: { kind: "approval-resolved", session: "s-master", request: "req-1", allowed: true, cancelled: false } },
  "event-chat": { type: "event", seq: 4187, event: { kind: "chat", session: "s-master", entry: 42, event: chatEvents.text } },
  "event-power": { type: "event", seq: 4188, event: { kind: "power", power } },
  "event-catalog": { type: "event", seq: 4189, event: { kind: "catalog", catalog } },
  "event-media": { type: "event", seq: 4190, event: { kind: "media", session: "s-master", items: [media] } },
  "response-ok": { type: "response", id: 7, result: { accepted: "coordinator", entry: 43 }, replayed: true },
  "response-error": { type: "response", id: 8, error: { code: "rejected", message: "Session closed" } },
  "protocol-mismatch": { type: "protocol_mismatch", server: 2, client: 1 },
  error: { type: "error", error: { code: "unauthorized", message: "Wrong token" } },
}

const results: Record<string, [Schema.Top, object]> = {
  "history-page": [HistoryPage, { session: "s-master", rows: [{ entry: 1, event: chatEvents.user }, { entry: 3, event: chatEvents.text }], hasOlder: true, hasNewer: false, evicted: true }],
  "create-result": [CreateResult, { session: "s-new" }],
  "send-result": [SendResult, { accepted: "coordinator", entry: 43 }],
  "upload-result": [UploadResult, { path: "/Users/me/Library/Application Support/Daycare/attachments/u/photo.jpg" }],
  "media-list": [MediaList, { session: "s-master", items: [media, { ...media, path: "/tmp/shot.png", name: "shot.png", mimeType: "image/png", kind: "image", entry: 12 }, { ...media, path: "/Users/me/code/app/song.m4a", name: "song.m4a", mimeType: "audio/mp4", kind: "audio", entry: null }] }],
  "push-data": [PushData, { kind: "approval", session: "s-master", request: "req-1" }],
  "activity-state": [ActivityState, { running: [{ id: "s-worker", name: "Bo", master: "Ada", since: 1762300000 }], runningCount: 1, approvals: 1, batteryPercent: 64, charging: false, keepAwake: true, updatedAt: 1762300060.5 }],
}

const command = (c: object, key?: string) => ({ type: "request", id: 1, ...(key ? { key } : {}), command: c })
const client: Record<string, object> = {
  hello: { type: "hello", protocol: 1, app: "1.0 (1)", token: "tok", device: "dev", resume: { epoch: "ep-1", seq: 4182 }, watch: { sessions: ["s-master"], deltas: true } },
  "hello-bare": { type: "hello", protocol: 1, app: "1.0 (1)", token: "tok", device: "dev" },
  watch: command({ method: "watch", sessions: ["s-master"], deltas: false }),
  history: command({ method: "history", session: "s-master", before: 10, limit: 50 }),
  create: command({ method: "create", provider: "claude", cwd: "/Users/me/code/app", prompt: "Fix it", model: null, effort: "high", permissionMode: "default", files: ["/a.jpg"] }, "k-create"),
  send: command({ method: "send", session: "s-master", text: "hi", files: [] }, "k-send"),
  upload: command({ method: "upload", name: "photo.jpg", data: "aGk=" }, "k-send:0"),
  interrupt: command({ method: "interrupt", session: "s-master" }, "k1"),
  answer: command({ method: "answer", session: "s-master", request: "req-1", choice: "deny", message: "Not now" }, "k2"),
  close: command({ method: "close", session: "s-master" }, "k3"),
  reopen: command({ method: "reopen", session: "s-master" }, "k4"),
  archive: command({ method: "archive", session: "s-worker" }, "k5"),
  unarchive: command({ method: "unarchive", session: "s-worker" }, "k6"),
  rename: command({ method: "rename", session: "s-master", name: "Ada 2" }, "k7"),
  remove: command({ method: "remove", session: "s-worker" }, "k8"),
  move: command({ method: "move", session: "s-master", accountId: "work" }, "k9"),
  model: command({ method: "model", session: "s-master", model: "sonnet" }, "k10"),
  effort: command({ method: "effort", session: "s-master", effort: "low" }, "k11"),
  configure: command({ method: "configure", workerModels: { workerModel: "sonnet", autoWorkerModel: true }, workerEfforts: { workerEffort: "low", autoWorkerEffort: false } }, "k12"),
  power: command({ method: "power", mode: "always" }, "k13"),
  media: command({ method: "media", session: "s-master" }),
  register: command({ method: "register", apnsToken: "abcd", environment: "development", pushToStart: null, kinds: ["approval", "battery-low"] }),
  unregister: command({ method: "unregister" }),
  activity: command({ method: "activity", activity: "act-1", token: "beef" }),
  "activity-ended": command({ method: "activity-ended", activity: "act-1" }),
}

const check = (name: string, schema: Schema.Top, value: object) => {
  Schema.decodeUnknownSync(schema as Schema.Codec<unknown, unknown>)(value)
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

mkdirSync(join(out, "chat"), { recursive: true })
mkdirSync(join(out, "server"), { recursive: true })
mkdirSync(join(out, "client"), { recursive: true })
mkdirSync(join(out, "result"), { recursive: true })

Object.entries(chatEvents).forEach(([name, value]) => check(`chat/${name}`, ChatEvent, value))
Object.entries(server).forEach(([name, value]) => check(`server/${name}`, MobileServerMessage, value))
Object.entries(client).forEach(([name, value]) => check(`client/${name}`, MobileClientMessage, value))
Object.entries(results).forEach(([name, [schema, value]]) => check(`result/${name}`, schema, value))

console.log(`fixtures written to ${out}`)
