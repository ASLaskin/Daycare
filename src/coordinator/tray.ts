// Linux tray icon: present while the coordinator runs, opens Daycare on click.

import * as dbus from "@particle/dbus-next"
import { Schema } from "effect"
import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import icon from "../../assets/brand/logos/block.png" with { type: "file" }

const ITEM = "org.kde.StatusNotifierItem"
const WATCHER = "org.kde.StatusNotifierWatcher"
const ICON_NAME = "daycare-tray"

type Watcher = dbus.ClientInterface & { RegisterStatusNotifierItem: (name: string) => Promise<void> }

const LaunchCommand = Schema.fromJsonString(Schema.NonEmptyArray(Schema.String))

// The command that starts Daycare, from DAYCARE_LAUNCH
const launchCommand = (env: NodeJS.ProcessEnv): ReadonlyArray<string> | null => {
  try {
    return Schema.decodeUnknownSync(LaunchCommand)(env["DAYCARE_LAUNCH"])
  } catch {
    return null
  }
}

// Without the service's DAYCARE_ settings, which Electron would write back as overrides
const launchEnv = (env: NodeJS.ProcessEnv) => Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("DAYCARE_")))

// Outside the service's cgroup, so restarting the coordinator leaves the window open
const open = (command: ReadonlyArray<string> | null) => {
  if (!command) {
    console.error("tray: DAYCARE_LAUNCH is not set; cannot open Daycare")
    return
  }
  spawn("systemd-run", ["--user", "--scope", "--quiet", "--", ...command], { detached: true, stdio: "ignore", env: launchEnv(process.env) })
    .on("error", (e) => console.error(`tray: ${e.message}`))
    .unref()
}

class Item extends dbus.interface.Interface {
  constructor(
    private readonly iconDir: string,
    private readonly activate: () => void,
  ) {
    super(ITEM)
  }
  get Category() {
    return "ApplicationStatus"
  }
  get Id() {
    return "daycare"
  }
  get Title() {
    return "Daycare"
  }
  get Status() {
    return "Active"
  }
  get IconName() {
    return ICON_NAME
  }
  get IconThemePath() {
    return this.iconDir
  }
  get ToolTip(): [string, Array<never>, string, string] {
    return ["", [], "Daycare", "Coordinator running"]
  }
  get ItemIsMenu() {
    return false
  }
  get Menu() {
    return "/NO_DBUSMENU"
  }
  Activate() {
    this.activate()
  }
  SecondaryActivate() {}
  ContextMenu() {}
  Scroll() {}
}

const read = { access: dbus.interface.ACCESS_READ } as const
const click = { inSignature: "ii", outSignature: "" }
// configureMembers writes into each options object, so none may be shared
Item.configureMembers({
  properties: {
    Category: { signature: "s", ...read },
    Id: { signature: "s", ...read },
    Title: { signature: "s", ...read },
    Status: { signature: "s", ...read },
    IconName: { signature: "s", ...read },
    IconThemePath: { signature: "s", ...read },
    ToolTip: { signature: "(sa(iiay)ss)", ...read },
    ItemIsMenu: { signature: "b", ...read },
    Menu: { signature: "o", ...read },
  },
  methods: {
    Activate: { ...click },
    SecondaryActivate: { ...click },
    ContextMenu: { ...click },
    Scroll: { inSignature: "is", outSignature: "" },
  },
})

// Registers the icon, and again whenever the tray host restarts
export const startTray = async (runtime: string) => {
  writeFileSync(path.join(runtime, `${ICON_NAME}.png`), readFileSync(icon))
  const command = launchCommand(process.env)
  const bus = dbus.sessionBus()
  bus.on("error", (e: Error) => console.error(`tray: ${e.message}`))
  const name = `${ITEM}-${process.pid}-1`
  bus.export("/StatusNotifierItem", new Item(runtime, () => open(command)))
  await bus.requestName(name, 0)
  const register = () =>
    bus
      .getProxyObject(WATCHER, "/StatusNotifierWatcher")
      .then((watcher) => watcher.getInterface<Watcher>(WATCHER).RegisterStatusNotifierItem(name))
      .catch((e: Error) => console.error(`tray: no tray host: ${e.message}`))
  const daemon = (await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus")).getInterface("org.freedesktop.DBus")
  daemon.on("NameOwnerChanged", (owned: string, _old: string, owner: string) => {
    if (owned === WATCHER && owner) {
      void register()
    }
  })
  await register()
  return { close: () => bus.disconnect() }
}
