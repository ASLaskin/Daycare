// AppPaths from Electron.

import { Layer } from "effect"
import { app } from "electron"
import os from "node:os"
import { asDirPath } from "../../shared/ids.ts"
import { AppPaths } from "../AppPaths.ts"

export const ElectronPaths = Layer.sync(AppPaths, () =>
  AppPaths.of({
    userData: asDirPath(app.getPath("userData")),
    appRoot: asDirPath(app.getAppPath()),
    home: asDirPath(os.homedir()),
  }),
)
