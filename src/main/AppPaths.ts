// Where the app keeps its files. A service so tests can point everything at a
// temp folder; the Electron layer reads the real locations from `app`.

import { Context } from "effect"

export class AppPaths extends Context.Service<
  AppPaths,
  {
    // settings.json, sessions.json, usage.json, the keep-awake sentinel.
    readonly userData: string
    // The package folder in dev, the bundle's app folder when packaged.
    readonly appRoot: string
    readonly home: string
  }
>()("daycare/AppPaths") {}
