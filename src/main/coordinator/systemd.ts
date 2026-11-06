// Linux: the coordinator as a systemd user service.

import { execFileSync } from "node:child_process"
import path from "node:path"
import type { DirPath } from "../../shared/ids.ts"
import type { CoordinatorSetup } from "./paths.ts"
import { writeIfChanged } from "./unitFile.ts"

export const UNIT = "daycare-coordinator.service"

// Quotes paths for systemd
const quote = (value: string) => `"${value.replace(/[\\"]/g, "\\$&").replace(/%/g, "%%")}"`

export const unitFile = (setup: CoordinatorSetup) =>
  [
    "# Written by Daycare on each launch; edits are overwritten.",
    "",
    "[Unit]",
    "Description=Daycare coordinator",
    "",
    "[Service]",
    `ExecStart=${quote(setup.bun)} ${quote(setup.script)}`,
    ...Object.entries(setup.env).map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`),
    "# Stop signals the coordinator alone, then kills whatever remains in the unit's cgroup",
    "KillMode=mixed",
    "TimeoutStopSec=15",
    "Restart=on-failure",
    "# Exit 3: another coordinator already owns the runtime directory",
    "RestartPreventExitStatus=3",
    "",
  ].join("\n")

const unitPath = (home: DirPath) => path.join(process.env["XDG_CONFIG_HOME"] || path.join(home, ".config"), "systemd", "user", UNIT)

const systemctl = (...args: ReadonlyArray<string>) => execFileSync("systemctl", ["--user", ...args], { stdio: "pipe", timeout: 15_000 })

export const startService = (setup: CoordinatorSetup, home: DirPath) => {
  if (writeIfChanged(unitPath(home), unitFile(setup))) {
    systemctl("daemon-reload")
  }
  systemctl("start", UNIT)
}

export const restartService = () => {
  systemctl("restart", UNIT)
}
