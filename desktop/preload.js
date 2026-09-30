"use strict";
/**
 * Secure IPC bridge for the splash screen.
 * contextIsolation is ON and nodeIntegration is OFF — the renderer receives a
 * tiny, explicitly allow-listed API surface and nothing else.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("srms", {
  onProgress: (cb) => ipcRenderer.on("boot:progress", (_e, payload) => cb(payload)),
  onError: (cb) => ipcRenderer.on("boot:error", (_e, payload) => cb(payload)),
  retry: () => ipcRenderer.invoke("boot:retry"),
  openLogs: () => ipcRenderer.invoke("boot:openLogs"),
  quit: () => ipcRenderer.invoke("boot:quit"),
});
