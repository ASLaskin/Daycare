// A service so tests use temp folders.

import { Context } from "effect"

export class AppPaths extends Context.Service<
  AppPaths,
  {
    readonly userData: string
    // Package folder in dev, app.asar packaged.
    readonly appRoot: string
    readonly home: string
  }
>()("daycare/AppPaths") {}
