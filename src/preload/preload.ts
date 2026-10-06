// The only bridge between the renderer and the main process. The renderer gets
// a single `window.daycare` object and nothing else from Node or Electron.

import { contextBridge } from "electron"

contextBridge.exposeInMainWorld("daycare", {})
