const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pehredar", {
  startDevicePolling: () => ipcRenderer.send("device:start"),
  onDeviceUpdate: (callback) => {
    ipcRenderer.on("device-update", (_event, data) => callback(data));
  },
  startScan: () => ipcRenderer.send("scan:start"),
  cancelScan: () => ipcRenderer.send("scan:cancel"),
  onProgress: (callback) => {
    ipcRenderer.on("scan-progress", (_event, data) => callback(data));
  },
  onScanExit: (callback) => {
    ipcRenderer.on("scan-exit", (_event, data) => callback(data));
  },
  onScanError: (callback) => {
    ipcRenderer.on("scan-error", (_event, data) => callback(data));
  },
  onScanSaved: (callback) => {
    ipcRenderer.on("scan-saved", (_event, data) => callback(data));
  },
  deviceInfo: () => ipcRenderer.invoke("device:info"),
  scans: {
    list: () => ipcRenderer.invoke("scans:list"),
    get: (id) => ipcRenderer.invoke("scans:get", id),
    export: (id) => ipcRenderer.invoke("scans:export", id),
    dir: () => ipcRenderer.invoke("scans:dir"),
    clear: () => ipcRenderer.invoke("scans:clear"),
  },
  openPath: (p) => ipcRenderer.invoke("shell:open", p),
});