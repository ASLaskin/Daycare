// AppPaths from Electron, with DAYCARE_USER_DATA override.

import { Layer } from "effect"
import { app } from "electron"
import os from "node:os"
import { asDirPath } from "../../shared/ids.ts"
import { AppPaths } from "../AppPaths.ts"

export const ElectronPaths = Layer.sync(AppPaths, () => {
  const override = process.env["DAYCARE_USER_DATA"]
  if (override) {
    app.setPath("userData", override)
  }
  return AppPaths.of({
    userData: asDirPath(app.getPath("userData")),
    appRoot: asDirPath(app.getAppPath()),
    home: asDirPath(os.homedir()),
  })
})
