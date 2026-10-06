// AppPaths from Electron. DAYCARE_USER_DATA runs an isolated instance with its
// own settings and sessions, for development.

import { app } from "electron"
import { Layer } from "effect"
import os from "node:os"
import { AppPaths } from "../AppPaths.ts"

export const ElectronPaths = Layer.sync(AppPaths, () => {
  const override = process.env["DAYCARE_USER_DATA"]
  if (override) app.setPath("userData", override)
  return AppPaths.of({ userData: app.getPath("userData"), appRoot: app.getAppPath(), home: os.homedir() })
})
