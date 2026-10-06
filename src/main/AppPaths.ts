// File locations the app reads and writes.

import { Context } from "effect"
import type { DirPath } from "../shared/ids.ts"

export class AppPaths extends Context.Service<
  AppPaths,
  {
    readonly userData: DirPath
    // Package folder in dev, app.asar when packaged
    readonly appRoot: DirPath
    readonly home: DirPath
  }
>()("daycare/AppPaths") {}
