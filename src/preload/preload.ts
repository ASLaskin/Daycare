// Exposes the IPC contract channels as window.daycare.

import { contextBridge, ipcRenderer } from "electron"
import { type Bridge, Invoke } from "../shared/ipc.ts"

const invokable = new Set<string>(Object.keys(Invoke))

const bridge: Bridge = {
  invoke: (channel, payload) =>
    invokable.has(channel) ? ipcRenderer.invoke(channel, payload) : Promise.reject(new Error(`Unknown channel ${channel}`)),
  on: (channel, listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld("daycare", bridge)
