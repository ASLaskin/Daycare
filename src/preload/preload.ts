// The only bridge between the renderer and the main process. The renderer gets
// a single generic `window.daycare` object; only channels named in the shared
// contract get through, so a compromised page cannot reach anything else.

import { contextBridge, ipcRenderer } from "electron"
import { type Bridge, Invoke, Send } from "../shared/ipc.ts"

const invokable = new Set<string>(Object.keys(Invoke))
const sendable = new Set<string>(Object.keys(Send))

const bridge: Bridge = {
  invoke: (channel, payload) =>
    invokable.has(channel) ? ipcRenderer.invoke(channel, payload) : Promise.reject(new Error(`Unknown channel ${channel}`)),
  send: (channel, payload) => {
    if (sendable.has(channel)) ipcRenderer.send(channel, payload)
  },
  on: (channel, listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload as never)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld("daycare", bridge)
